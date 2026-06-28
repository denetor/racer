import {Color, CollisionType, EmitterType, Engine, ParticleEmitter, vec, Vector} from "excalibur";
import {BaseVehicleActor} from "@/actors/base-vehicle.actor";
import {WheelState} from "@/models/wheel-state.model";
import {VehicleStats} from "@/models/vehicle-stats.model";
import {Drivetrain, getTotalMass, localToBody, pxPerMeter as computePxPerMeter, Vec2, WheelArms} from "@/services/vehicle-physics.service";

/** Per-vehicle smoke tuning: particle rate when a wheel is sliding (wheelspin/lockup), 0 when not. */
const WHEEL_SMOKE_EMIT_RATE = 120;

/**
 * Force-based vehicle. Shares the visual setup with {@link BaseVehicleActor} and adds the planar
 * rigid-body state in SI units (body frame: x = forward, y = lateral). Position and collisions are
 * owned by Excalibur; velocity is our source of truth and written to `actor.vel` each frame.
 *
 * Holds the full per-vehicle datasheet as the single source of truth. Many fields are still inert
 * placeholders (cog, Iz, Cα, drivetrain, fuel, ...): they are consumed by the later physics steps,
 * but declared here from the start so there is one place to tune a vehicle.
 */
export class PhysicVehicleActor extends BaseVehicleActor {
    // motion state required by the visual base (writable: the drive systems mutate them)
    public heading: Vector = vec(1, 0);
    public steeringAngle: number = 0;

    // planar rigid-body state in SI, body frame (x = forward, y = lateral)
    public velBody: Vector = vec(0, 0); // m/s
    public yawRate: number = 0;         // rad/s
    public isReverse: boolean = false;  // reverse gear toggle

    // smoothed pedal inputs [0, 1] (ramped from the input targets by the update system)
    public throttleInput: number = 0;
    public brakeInput: number = 0;
    // longitudinal acceleration of the last integrated frame (m/s²), exposed for the debug HUD
    public longitudinalAccel: number = 0;
    // signed total drive force applied last frame (N), exposed for the debug HUD (kN + power-limited)
    public driveForce: number = 0;
    // Body-frame acceleration of the last frame (m/s²): the net force / mass, i.e. the true COG
    // acceleration (the Coriolis terms cancel). Written at the end of integration and read the next
    // frame as the source of dynamic load transfer — the one-frame lag breaks the Fz↔force loop.
    public bodyAccel: Vector = vec(0, 0);
    // average front/rear axle slip angle of the last frame (rad), exposed for the debug HUD
    public slipAngleFront: number = 0;
    public slipAngleRear: number = 0;

    // Metric driving statistics (distance travelled, last stopping distance), updated each frame by the
    // update system with the SI state. Separate from the race data (laps/checkpoints).
    public stats: VehicleStats = new VehicleStats();

    // Per-wheel physics state for the new force-based path (grip, Fz, slip, saturation, surface stack),
    // parallel to the inherited `wheelFactors`. Co-owned: the SurfacesService writes `gripSurface`/the
    // surface stack, the update system writes `load`/`slipAngle`/`saturated`, the debug HUD reads.
    public wheelStates: Map<string, WheelState> = new Map([
        ['frontLeftWheel', new WheelState()],
        ['frontRightWheel', new WheelState()],
        ['rearLeftWheel', new WheelState()],
        ['rearRightWheel', new WheelState()],
    ]);

    // Per-wheel smoke emitters (Step 5), created in onInitialize and keyed by wheel name. They live
    // ONLY on this actor (not on BaseVehicleActor), so the legacy VehicleActor and its Playwright
    // baseline are untouched. Toggled by setWheelSmoke from the wheelspin/lockup flags.
    private wheelSmoke: Map<string, ParticleEmitter> = new Map();

    // --- per-vehicle datasheet (single source of truth) ---
    public mass: number = 1500;         // kg, chassis mass (ex `weight`)
    public lengthMeters: number = 4.5;  // m; with the 121px sprite height -> pxPerMeter

    // Centre of gravity in body-frame metres, relative to the sprite centre (forward x, lateral y).
    // Default is the geometric centre — the implicit assumption of the old model.
    public cogPosition: Vector = vec(0, 0);
    public cogHeight: number = 0.5;     // m, COG height above ground; load-transfer gain (inert at Step 0)

    // Tyre cornering stiffness Cα (N/rad, **per wheel**; the axle total emerges by summing the two
    // tyres): lateral force per unit slip angle. The rear bites a bit more than the front to give a
    // slight, safe-to-tune understeer (the front loses grip first, so the car widens before it spins).
    public corneringStiffnessFront: number = 60000;
    public corneringStiffnessRear: number = 50000;

    // Drivetrain: which axle(s) receive the drive force, and the front fraction for AWD.
    public drivetrain: Drivetrain = 'rwd';
    public driveBias: number = 0;       // [0, 1] fraction of drive to the front axle (AWD only)

    // Power-limited engine (spec §3.8): F_drive = min(maxDriveForce, enginePower / |v_x|). Strong from
    // rest (maxDriveForce), fading as P/v; the top speed emerges as a plateau against aero + rolling
    // resistance, with no hard speed cap.
    public enginePower: number = 150000;    // W (~200 hp)
    public maxDriveForce: number = 5500;    // N, traction ceiling from rest (ex tracerDriveForce role)

    // Aerodynamics (spec §3.8): F_aero = ½·ρ·Cd·A·v², a body force at the COG opposing motion. Sets
    // where the top-speed plateau lands together with enginePower.
    public dragCoefficient: number = 0.7;   // Cd
    public frontalArea: number = 2.2;       // m²

    // Fuel mass, concentrated at the COG and burned slowly over time (inert at Step 0). The physics
    // mass is `getTotalMass(mass, fuelMass)` so burn reflects everywhere through one helper.
    public fuelCapacity: number = 60;   // kg, full tank
    public fuelMass: number = 60;       // kg, current fuel
    public fuelBurn: number = 0.01;     // kg/s, at full throttle
    // Throttle-seconds accumulated since the last burn (Step 6). The update system sums
    // `throttleInput · Δt` here and applies the burn over FUEL_BURN_THRESHOLD, so the mass drops on a
    // slow cadence (not every frame) and stays proportional to the gas. Not part of the datasheet.
    public fuelThrottleAccumulator: number = 0;

    // Tyre wear (spec §4 "Usura gomme"): grip degrades with distance via μ_eff = gripSurface · wear.
    // Per-vehicle compound — wear consumed per km of wheel travel, multiplied by tyreWearSlipPenalty
    // while the wheel slides (saturated). The shared floor MIN_TYRE_WEAR keeps a worn tyre drivable.
    public tyreWearRate: number = 0.01;        // wear fraction consumed per km of wheel travel
    public tyreWearSlipPenalty: number = 5;   // multiplier on the wear rate while the wheel saturates the circle

    // pedal press/release rates (units per second), reused by the shared smoothPedal actuation
    public throttlePressRate: number = 5.0;
    public throttleReleaseRate: number = 5.0;
    public brakePressRate: number = 5.0;
    public brakeReleaseRate: number = 5.0;
    // steering: max angle (rad) and ramp/return speeds (rad/s); drives the front-wheel rendering only
    public maxSteeringAngle: number = 0.4;
    public steeringSpeed: number = 2.5;
    public steeringReturnSpeed: number = 2.5;

    // Braking (spec §3.9): separate from the drive, distributed across the four wheels with a front
    // bias and entering the friction circle per wheel (so the fronts — loaded by weight transfer —
    // saturate/lock first). brakeForce is the total at full brake; brakeBias the front fraction.
    public brakeForce: number = 25000;  // N total at full brake (opposes each wheel's motion)
    public brakeBias: number = 0.5;     // [0, 1] fraction of the brake to the front axle
    // reverse can only be toggled at (near) standstill, below this speed (m/s)
    public reverseToggleMaxSpeed: number = 0.5;

    /**
     * Turns the four wheel child actors into `Passive` collision sensors after the visual base has
     * created them. Passive wheels emit `collisionstart`/`collisionend` with the surfaces (so the
     * SurfacesService can read the per-wheel grip) without any physical response — the `Active` body
     * keeps handling the walls. Confined to this actor: {@link BaseVehicleActor} and the old
     * `VehicleActor` keep their wheels at the default `PreventCollision`, so the Playwright baseline
     * is untouched and the new SurfacesService branch stays inert for them.
     */
    override onInitialize(engine: Engine): void {
        super.onInitialize(engine);
        const wheels: [string, typeof this.frontLeftWheel][] = [
            ['frontLeftWheel', this.frontLeftWheel],
            ['frontRightWheel', this.frontRightWheel],
            ['rearLeftWheel', this.rearLeftWheel],
            ['rearRightWheel', this.rearRightWheel],
        ];
        for (const [name, wheel] of wheels) {
            wheel.body.collisionType = CollisionType.Passive;
            // One smoke emitter per wheel, at the wheel's local position (nose-up frame), child of the
            // vehicle. Starts off (emitRate 0); the update system raises it when the wheel slides.
            const emitter = this.makeWheelSmokeEmitter(wheel.pos.clone());
            this.addChild(emitter);
            this.wheelSmoke.set(name, emitter);
        }
    }

    /** Builds a per-wheel smoke emitter at `pos` (local frame), initially off (emitRate 0). */
    private makeWheelSmokeEmitter(pos: Vector): ParticleEmitter {
        return new ParticleEmitter({
            pos,
            isEmitting: true,
            emitRate: 0, // off until a skid raises it via setWheelSmoke
            emitterType: EmitterType.Circle,
            radius: 4,
            particle: {
                minSpeed: 5,
                maxSpeed: 20,
                minAngle: 0,
                maxAngle: Math.PI * 2,
                minSize: 2,
                maxSize: 8,
                startSize: 1,
                endSize: 6,
                acc: vec(0, 0),
                life: 700,
                opacity: 0.6,
                fade: true,
                beginColor: Color.White,
                endColor: Color.White,
            },
        });
    }

    /** Turns a single wheel's smoke on/off (Step 5). No-op if the emitter is not yet created. */
    public setWheelSmoke(name: string, enabled: boolean): void {
        const emitter = this.wheelSmoke.get(name);
        if (emitter) emitter.emitRate = enabled ? WHEEL_SMOKE_EMIT_RATE : 0;
    }

    public get pxPerMeter(): number {
        return computePxPerMeter(this.lengthMeters);
    }

    /** Total physics mass (kg): chassis + current fuel, via the single-source-of-truth helper. */
    public get totalMass(): number {
        return getTotalMass(this.mass, this.fuelMass);
    }

    /** Wheelbase L (m), from the axle positions drawn (in px) by the base. */
    public get wheelbaseMeters(): number {
        return (Math.abs(this.frontAxlePosition) + Math.abs(this.rearAxlePosition)) / this.pxPerMeter;
    }

    /** Average track W (m), from the axle widths drawn (in px) by the base. */
    public get trackMeters(): number {
        return ((this.frontAxleWidth + this.rearAxleWidth) / 2) / this.pxPerMeter;
    }

    /** Front track (m), from the front axle width drawn (in px) by the base. */
    public get trackFrontMeters(): number {
        return this.frontAxleWidth / this.pxPerMeter;
    }

    /** Rear track (m), from the rear axle width drawn (in px) by the base. */
    public get trackRearMeters(): number {
        return this.rearAxleWidth / this.pxPerMeter;
    }

    /**
     * Yaw moment of inertia Iz ≈ m·(L²+W²)/12 (kg·m²): tuning knob for how readily the body rotates.
     * Derived from the total mass and geometry so it stays consistent as they change.
     */
    public get Iz(): number {
        const L = this.wheelbaseMeters;
        const W = this.trackMeters;
        return this.totalMass * (L * L + W * W) / 12;
    }

    /**
     * The four wheel arms `r_i` in body-frame metres, relative to the COG. The wheels are drawn in
     * the nose-up local frame; {@link localToBody} maps that geometry onto the physics body frame
     * (forward = +x) without rotating the spritesheet.
     */
    public get wheelArmsBody(): WheelArms {
        const arm = (localX: number, localY: number): Vec2 => {
            const body = localToBody({x: localX / this.pxPerMeter, y: localY / this.pxPerMeter});
            return {x: body.x - this.cogPosition.x, y: body.y - this.cogPosition.y};
        };
        return {
            frontLeftWheel: arm(-this.frontAxleWidth / 2, this.frontAxlePosition),
            frontRightWheel: arm(this.frontAxleWidth / 2, this.frontAxlePosition),
            rearLeftWheel: arm(-this.rearAxleWidth / 2, this.rearAxlePosition),
            rearRightWheel: arm(this.rearAxleWidth / 2, this.rearAxlePosition),
        };
    }
}
