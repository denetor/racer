import {Query, System, SystemPriority, SystemType, vec, World} from "excalibur";
import {DriverInputComponent} from "@/components/driver-input.component";
import {PhysicVehicleActor} from "@/actors/physic-vehicle.actor";
import {aeroDrag, bodyToWorld, clampToFrictionCircle, distributeBrake, distributeDrive, driveForce, dynamicLoad, integrateBody, lateralForceLinear, longitudinalSaturation, lowSpeedKinematicBlend, rollingResistance, slipAngle, staticLoad, wheelVelocity, WheelLoads} from "@/services/vehicle-physics.service";
import {smoothPedal, sumClamp} from "@/services/math.service";
import {CRR, DEFAULT_SURFACE_GRIP, G, LOW_SPEED_BLEND_THRESHOLD, RHO_AIR, SKID_MIN_SPEED, V_FLOOR} from "@/constants/physics.constants";

/**
 * Applies the physics. Reads the driving intent ({@link DriverInputComponent}), actuates it
 * (pedal/steer smoothing) and integrates the planar rigid-body dynamics in SI, then writes the
 * world velocity (px/s) to the actor. Position and collisions are left to Excalibur's Arcade
 * solver (`actor.pos` is never written). Agnostic to who produced the intent, so it also drives AI
 * cars unchanged.
 *
 * The car turns from **real per-wheel tyre forces**: each wheel sees its own velocity (it sits at a
 * different point of the rotating body), hence its own slip angle, hence a linear lateral force
 * `Fy = −Cα·α`, **clamped per wheel to the friction circle `μ·Fz`** (μ = the live surface grip, Fz =
 * the dynamic load: static split plus longitudinal transfer under accel/braking). Those forces sum
 * into the net `Fx`/`Fy` and a yaw torque `Mz`, so the yaw rate
 * **emerges** from the geometry — and the *asymmetric* saturation (front vs rear, grass side vs
 * tarmac side) makes the car slide, under/oversteer and "pull" to one side without scripting it. The
 * longitudinal propulsion stays the Step 0 "tracer" at the COG (no yaw torque from it, not clamped).
 * The actuation smoothing (shared with human/AI sources) lives here, not in the input system.
 */
export class PhysicDriveUpdateSystem extends System {
    public priority = SystemPriority.Average;
    public systemType = SystemType.Update;
    private query: Query<typeof DriverInputComponent>;

    constructor(world: World) {
        super();
        this.query = world.query([DriverInputComponent]);
    }

    public update(elapsed: number): void {
        const dt = elapsed / 1000;
        for (const entity of this.query.entities) {
            if (!(entity instanceof PhysicVehicleActor)) continue;
            const input = entity.get(DriverInputComponent);
            if (!input) continue;

            this.handleReverseToggle(entity, input);
            this.smoothPedals(entity, input, dt);
            this.updateSteeringAngle(entity, input.steerTarget, dt);
            this.integrateMotion(entity, dt);

            entity.setEmitters('throttle', input.throttleTarget > 0);
        }
    }

    /** Flips reverse gear on a one-shot request, only at (near) standstill; then clears the request. */
    private handleReverseToggle(vehicle: PhysicVehicleActor, input: DriverInputComponent): void {
        if (input.reverseToggleRequested && Math.abs(vehicle.velBody.x) < vehicle.reverseToggleMaxSpeed) {
            vehicle.isReverse = !vehicle.isReverse;
        }
        input.reverseToggleRequested = false; // consume the one-shot intent
    }

    /** Ramps the smoothed pedal inputs toward the (binary) targets, reusing the shared smoothPedal. */
    private smoothPedals(vehicle: PhysicVehicleActor, input: DriverInputComponent, dt: number): void {
        vehicle.throttleInput = smoothPedal(vehicle.throttleInput, input.throttleTarget > 0, vehicle.throttlePressRate, vehicle.throttleReleaseRate, dt);
        vehicle.brakeInput = smoothPedal(vehicle.brakeInput, input.brakeTarget > 0, vehicle.brakePressRate, vehicle.brakeReleaseRate, dt);
    }

    /**
     * Ramps the steering angle toward `steerTarget * maxSteeringAngle`, returning to center when no
     * steer is requested. Same ramp/return logic as the old DriveInputSystem, driven by the [-1, 1]
     * intent instead of raw left/right keys. Rotates the front wheels visually; does not curve the car.
     */
    private updateSteeringAngle(vehicle: PhysicVehicleActor, steerTarget: number, dt: number): void {
        const max = vehicle.maxSteeringAngle;
        if (steerTarget !== 0) {
            const steerDelta = dt * vehicle.steeringSpeed * Math.sign(steerTarget);
            vehicle.steeringAngle = sumClamp(vehicle.steeringAngle, steerDelta, -max, max);
        } else {
            const steerDelta = dt * vehicle.steeringReturnSpeed;
            if (vehicle.steeringAngle > 0) {
                vehicle.steeringAngle = sumClamp(vehicle.steeringAngle, -steerDelta, 0, max);
            } else if (vehicle.steeringAngle < 0) {
                vehicle.steeringAngle = sumClamp(vehicle.steeringAngle, steerDelta, -max, 0);
            }
        }
    }

    /**
     * Builds the net force and yaw torque from the power-limited engine, the per-wheel brake and
     * rolling resistance, the aerodynamic drag and the four tyre lateral forces, applies the low-speed
     * kinematic blend, integrates one rigid-body step, and rotates the heading by the resulting yaw.
     *
     * Engine (spec §3.8): `F_drive = throttle · min(F_max, P / max(|v_x|, V_FLOOR))`, strong from
     * rest and fading as `P/v`, signed by the reverse gear. It is **distributed per wheel** by the
     * drivetrain ({@link distributeDrive}, spec §3.9) and enters the friction circle as each wheel's
     * longitudinal `Fx` — so power over/understeer emerge from the asymmetric saturation, not from
     * scripting. The top speed is a **plateau** where `P/v = F_aero + ΣF_roll` (no hard cap).
     *
     * Brake (spec §3.9): a separate total force distributed front-biased ({@link distributeBrake}),
     * each wheel's share opposing its own longitudinal velocity and summed (signed) with the drive and
     * the rolling resistance into that wheel's longitudinal demand — so the weight-loaded fronts
     * saturate/lock first, and the brake yaw emerges per wheel. Aerodynamic drag (`½·ρ·Cd·A·v²`) is
     * the one longitudinal force left at the COG (no yaw torque), outside both the circle and the blend.
     *
     * Per wheel: take its velocity (it rotates with the body), its slip angle (front wheels subtract
     * the steering `δ`, rear `0`), the linear lateral force `Fy = −Cα·α`, and **clamp the combined
     * (Fx, Fy) to the friction circle `μ·Fz`** — per wheel, before the sum, recording
     * `slipAngle`/`saturated`/`longitudinalForce` on the `WheelState`. The clamped front-wheel force
     * is **rotated by `δ`** back into the body frame before summing. Summing the forces gives the tyre
     * `Fx`/`Fy`; summing their moments `r_i_x·F_i_y − r_i_y·F_i_x` gives the yaw torque.
     *
     * Low-speed blend (spec §3.10): the slip angles below {@link LOW_SPEED_BLEND_THRESHOLD} are
     * `atan2` noise, so **only the lateral demand** is scaled by `k` (→ 0 at standstill), **before**
     * the clamp; the **longitudinal demand (drive) stays full** so the car pulls away from rest, and
     * the circle is left almost fully available for traction. The yaw rate still blends toward the
     * kinematic bicycle value at the end, taming any drive-induced yaw at low speed. The tracer brake
     * cannot push the car past zero into the opposite direction (it stops at standstill).
     */
    private integrateMotion(vehicle: PhysicVehicleActor, dt: number): void {
        const vx = vehicle.velBody.x;
        const vy = vehicle.velBody.y;
        const omega = vehicle.yawRate;
        const mass = vehicle.totalMass;
        const speed = Math.hypot(vx, vy);

        // Power-limited engine (spec §3.8): strong from rest (F_max), fading as P/v; signed by gear.
        // Distributed per wheel by the drivetrain (spec §3.9) so it enters the friction circle below.
        const vEngine = Math.max(Math.abs(vx), V_FLOOR);
        const driveDir = vehicle.isReverse ? -1 : 1;
        const fDriveSigned = vehicle.throttleInput * driveForce(vehicle.enginePower, vehicle.maxDriveForce, vEngine) * driveDir;
        vehicle.driveForce = fDriveSigned; // HUD readout (N, signed)
        const driveShares = distributeDrive(fDriveSigned, vehicle.drivetrain, vehicle.driveBias);

        // Brake (spec §3.9): the smoothed pedal scaled to the total force, distributed front-biased and
        // 50/50 within each axle. Per-wheel magnitudes (≥ 0); each is applied below opposing the wheel's
        // longitudinal velocity, inside the friction circle (so the weight-loaded fronts lock first).
        const brakeTotal = vehicle.brakeInput * vehicle.brakeForce;
        const brakeShares = distributeBrake(brakeTotal, vehicle.brakeBias);

        // Aerodynamic drag (spec §3.8): a body force at the COG opposing v_x, no yaw, zero at
        // standstill. Outside the friction circle and the low-speed blend.
        const fxCog = -Math.sign(vx) * aeroDrag(RHO_AIR, vehicle.dragCoefficient, vehicle.frontalArea, vx);

        // Per-wheel tyre forces: each wheel's drive share plus its slip-angle lateral force, combined
        // inside the friction circle. The curve and the power balance emerge from each wheel.
        const arms = vehicle.wheelArmsBody;
        // Static load Fz per wheel (spec §3.3), then the dynamic load with load transfer (spec §3.4).
        // The dynamic Fz is the friction-circle radius input; the static one is kept as the HUD bar
        // baseline. a_x/a_y come from last frame's body acceleration (net force / mass): the one-frame
        // lag breaks the Fz↔force loop. The COG stays fixed — only the load redistributes.
        const staticLoads = staticLoad(vehicle.totalMass, G, arms);
        const loads = dynamicLoad(staticLoads, vehicle.totalMass, vehicle.bodyAccel.x, vehicle.bodyAccel.y, vehicle.cogHeight, vehicle.wheelbaseMeters, vehicle.trackFrontMeters, vehicle.trackRearMeters);
        // Low-speed blend factor k: scales the lateral demand (below) and the final yaw.
        const blend = lowSpeedKinematicBlend(speed, LOW_SPEED_BLEND_THRESHOLD, vx, vehicle.steeringAngle, vehicle.wheelbaseMeters);
        const k = blend.lateralScale;
        const wheels: {name: keyof WheelLoads; arm: typeof arms.frontLeftWheel; isFront: boolean}[] = [
            {name: 'frontLeftWheel', arm: arms.frontLeftWheel, isFront: true},
            {name: 'frontRightWheel', arm: arms.frontRightWheel, isFront: true},
            {name: 'rearLeftWheel', arm: arms.rearLeftWheel, isFront: false},
            {name: 'rearRightWheel', arm: arms.rearRightWheel, isFront: false},
        ];
        let fxTyre = 0;
        let fyTyre = 0;
        let mzTyre = 0;
        let slipFrontSum = 0;
        let slipRearSum = 0;
        for (const {name, arm, isFront} of wheels) {
            const wheelState = vehicle.wheelStates.get(name);
            const fz = loads[name];
            const mu = wheelState?.gripSurface ?? DEFAULT_SURFACE_GRIP;
            const delta = isFront ? vehicle.steeringAngle : 0;
            const cAlpha = isFront ? vehicle.corneringStiffnessFront : vehicle.corneringStiffnessRear;
            const wv = wheelVelocity(vx, vy, omega, arm);
            const alpha = slipAngle(wv.x, wv.y, delta);
            // Longitudinal demand stays full (so the car accelerates from rest); the lateral demand is
            // scaled by k *before* the clamp (atan2 noise at low speed). The circle couples them, so at
            // low speed the radius is left almost entirely to traction. The per-wheel rolling
            // resistance (spec §3.8) opposes this wheel's longitudinal velocity with `Crr·rollFactor·Fz`
            // — high on grass, so an asymmetric surface drags one side and yaws the car ("pull").
            const rollFactor = wheelState?.rollFactor ?? 1;
            const fRoll = rollingResistance(CRR, rollFactor, fz);
            // Drive (signed) summed with the brake and rolling resistance, both opposing this wheel's
            // longitudinal velocity. Drive + brake together partly cancel (left-foot braking).
            const fxLong = driveShares[name] - Math.sign(wv.x) * (fRoll + brakeShares[name]);
            const fLat = k * lateralForceLinear(alpha, cAlpha);
            // Friction circle, **per wheel, before the sum**: the asymmetric saturation (front vs rear,
            // grass side vs tarmac side) is what produces the yaw torque that makes the car slide and
            // "pull". Clamping the net force would erase it.
            const clamped = clampToFrictionCircle(fxLong, fLat, mu, fz);
            // Step 5: classify the longitudinal saturation into wheelspin/lockup (pure reading, the
            // applied force above is unchanged). Suppressed below SKID_MIN_SPEED so the flags — and the
            // smoke they drive — don't flicker near standstill. A wheel is "driven" iff it got a drive
            // share this frame; that already gates wheelspin to the driven axle.
            const isDriven = driveShares[name] !== 0;
            const skid = longitudinalSaturation(driveShares[name], brakeShares[name], fRoll, fLat, mu, fz, isDriven);
            const moving = speed > SKID_MIN_SPEED;
            if (wheelState) {
                wheelState.load = fz;
                wheelState.loadStatic = staticLoads[name];
                wheelState.slipAngle = alpha;
                wheelState.saturated = clamped.saturated;
                wheelState.longitudinalForce = clamped.fx;
                wheelState.wheelspin = moving && skid.wheelspin;
                wheelState.lockup = moving && skid.lockup;
            }
            // Rotate the clamped wheel-frame force by δ into the body frame (rear: δ = 0 -> no-op).
            const fwx = clamped.fx * Math.cos(delta) - clamped.fy * Math.sin(delta);
            const fwy = clamped.fx * Math.sin(delta) + clamped.fy * Math.cos(delta);
            fxTyre += fwx;
            fyTyre += fwy;
            mzTyre += arm.x * fwy - arm.y * fwx;
            if (isFront) slipFrontSum += alpha; else slipRearSum += alpha;
        }
        vehicle.slipAngleFront = slipFrontSum / 2;
        vehicle.slipAngleRear = slipRearSum / 2;

        // Net body force/torque: COG aerodynamic drag + the per-wheel tyre forces (drive/brake/roll +
        // lateral). The lateral component is already k-scaled inside the clamp, so the tyre sums are
        // added as-is: the longitudinal (drive/brake) yaw acts fully, the lateral yaw keeps its k — the
        // final omega blend tames the rest at low speed.
        const fx = fxCog + fxTyre;
        const fy = fyTyre;
        const mz = mzTyre;

        const next = integrateBody({vx, vy, omega}, fx, fy, mz, mass, vehicle.Iz, dt);
        // Braking decelerates but never reverses the car on its own: clamp to standstill on overshoot.
        if (vehicle.throttleInput === 0 && brakeTotal > 0 && vx !== 0 && Math.sign(next.vx) !== Math.sign(vx)) {
            next.vx = 0;
        }
        // Blend the yaw toward the kinematic value at low speed (k=1 keeps the full dynamic yaw).
        next.omega = k * next.omega + (1 - k) * blend.kinematicYaw;

        vehicle.longitudinalAccel = dt > 0 ? (next.vx - vx) / dt : 0;
        // Store the body-frame acceleration (net force / mass) for next frame's load transfer. The
        // Coriolis terms cancel, so fx/m and fy/m are exactly the COG acceleration that shifts load.
        vehicle.bodyAccel = vec(fx / mass, fy / mass);
        vehicle.velBody = vec(next.vx, next.vy);
        vehicle.yawRate = next.omega;

        // Rotate the heading by the yaw and re-normalize to avoid numerical drift (as the old model did).
        vehicle.heading = vehicle.heading.rotate(next.omega * dt).normalize();

        const theta = Math.atan2(vehicle.heading.y, vehicle.heading.x);
        const worldVel = bodyToWorld(vehicle.velBody, theta);
        vehicle.vel = vec(worldVel.x * vehicle.pxPerMeter, worldVel.y * vehicle.pxPerMeter);
    }
}