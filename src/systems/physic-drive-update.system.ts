import {Query, System, SystemPriority, SystemType, vec, World} from "excalibur";
import {DriverInputComponent} from "@/components/driver-input.component";
import {PhysicVehicleActor} from "@/actors/physic-vehicle.actor";
import {bodyToWorld, clampToFrictionCircle, integrateBody, lateralForceLinear, lowSpeedKinematicBlend, slipAngle, staticLoad, wheelVelocity, WheelLoads} from "@/services/vehicle-physics.service";
import {smoothPedal, sumClamp} from "@/services/math.service";
import {DEFAULT_SURFACE_GRIP, G, LOW_SPEED_BLEND_THRESHOLD} from "@/constants/physics.constants";

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
 * the static load). Those forces sum into the net `Fx`/`Fy` and a yaw torque `Mz`, so the yaw rate
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
     * Builds the net force and yaw torque from the longitudinal tracer plus the four tyre lateral
     * forces, applies the low-speed kinematic blend, integrates one rigid-body step, and rotates the
     * heading by the resulting yaw.
     *
     * Longitudinal tracer at the COG (Step 0, no yaw torque): throttle drive (signed by reverse
     * gear) plus a brake force opposing motion, with linear drag as the force `−m·dragCoeff·v_x` so
     * the integrator stays purely force-driven. Per wheel: take its velocity (it rotates with the
     * body), its slip angle (front wheels subtract the steering `δ`, rear wheels `0`), the linear
     * lateral force `Fy = −Cα·α`, and **clamp it to the friction circle `μ·Fz`** (the live surface
     * grip and the static load) — per wheel, before the sum, recording `slipAngle`/`saturated` on the
     * `WheelState`. The clamped front-wheel force is **rotated by `δ`** back into the body frame
     * before summing, so even at wide steer the curve stays faithful. Summing the forces gives the
     * tyre `Fx`/`Fy`; summing their moments `r_i_x·F_i_y − r_i_y·F_i_x` gives the yaw torque. The
     * clamp is the physical limit (before the sum, so asymmetric saturation yaws the car); the
     * low-speed blend below is the numerical stabiliser (after).
     *
     * Below {@link LOW_SPEED_BLEND_THRESHOLD} the slip angles are `atan2` noise, so the dynamic tyre
     * forces are scaled by `k` (→ 0 at standstill) and the yaw rate blends toward the kinematic
     * bicycle value: the car steers smoothly from rest without vibrating or launching off on a
     * tangent. At/above the threshold (`k = 1`) the full dynamic Phase-2 model applies. The brake
     * cannot push the car past zero into the opposite direction (it stops at standstill).
     */
    private integrateMotion(vehicle: PhysicVehicleActor, dt: number): void {
        const vx = vehicle.velBody.x;
        const vy = vehicle.velBody.y;
        const omega = vehicle.yawRate;
        const mass = vehicle.totalMass;
        const speed = Math.hypot(vx, vy);

        // Longitudinal "tracer" at the COG (always applied, never blended away).
        const driveDir = vehicle.isReverse ? -1 : 1;
        const driveForce = vehicle.throttleInput * vehicle.tracerDriveForce * driveDir;
        const brakeForce = vehicle.brakeInput * vehicle.tracerBrakeForce;
        const dragForce = -mass * vehicle.linearDragCoeff * vx;
        const fxTracer = driveForce - Math.sign(vx) * brakeForce + dragForce;

        // Per-wheel linear tyre forces: the curve emerges from each wheel's slip angle.
        const arms = vehicle.wheelArmsBody;
        // Static load Fz per wheel (from the total mass and geometry), the friction-circle radius input.
        const loads = staticLoad(vehicle.totalMass, G, arms);
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
            const fLat = lateralForceLinear(alpha, cAlpha); // linear lateral force in the wheel frame
            // Friction circle, **per wheel, before the sum** (Fx = 0 at Step 2): the asymmetric
            // saturation (front vs rear, grass side vs tarmac side) is what produces the yaw torque
            // that makes the car slide and "pull". Clamping the net force would erase it.
            const clamped = clampToFrictionCircle(0, fLat, mu, fz);
            if (wheelState) {
                wheelState.load = fz;
                wheelState.slipAngle = alpha;
                wheelState.saturated = clamped.saturated;
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

        // Low-speed blend: fade the dynamic tyre forces out and the yaw toward the kinematic value.
        const blend = lowSpeedKinematicBlend(speed, LOW_SPEED_BLEND_THRESHOLD, vx, vehicle.steeringAngle, vehicle.wheelbaseMeters);
        const k = blend.lateralScale;
        const fx = fxTracer + k * fxTyre;
        const fy = k * fyTyre;
        const mz = k * mzTyre;

        const next = integrateBody({vx, vy, omega}, fx, fy, mz, mass, vehicle.Iz, dt);
        // Braking decelerates but never reverses the car on its own: clamp to standstill on overshoot.
        if (driveForce === 0 && brakeForce > 0 && vx !== 0 && Math.sign(next.vx) !== Math.sign(vx)) {
            next.vx = 0;
        }
        // Blend the yaw toward the kinematic value at low speed (k=1 keeps the full dynamic yaw).
        next.omega = k * next.omega + (1 - k) * blend.kinematicYaw;

        vehicle.longitudinalAccel = dt > 0 ? (next.vx - vx) / dt : 0;
        vehicle.velBody = vec(next.vx, next.vy);
        vehicle.yawRate = next.omega;

        // Rotate the heading by the yaw and re-normalize to avoid numerical drift (as the old model did).
        vehicle.heading = vehicle.heading.rotate(next.omega * dt).normalize();

        const theta = Math.atan2(vehicle.heading.y, vehicle.heading.x);
        const worldVel = bodyToWorld(vehicle.velBody, theta);
        vehicle.vel = vec(worldVel.x * vehicle.pxPerMeter, worldVel.y * vehicle.pxPerMeter);
    }
}