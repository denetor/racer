import {Query, System, SystemPriority, SystemType, vec, World} from "excalibur";
import {DriverInputComponent} from "@/components/driver-input.component";
import {PhysicVehicleActor} from "@/actors/physic-vehicle.actor";
import {bodyToWorld, integrateBody, lateralForceLinear, slipAngle, wheelVelocity} from "@/services/vehicle-physics.service";
import {smoothPedal, sumClamp} from "@/services/math.service";

/**
 * Applies the physics. Reads the driving intent ({@link DriverInputComponent}), actuates it
 * (pedal/steer smoothing) and integrates the planar rigid-body dynamics in SI, then writes the
 * world velocity (px/s) to the actor. Position and collisions are left to Excalibur's Arcade
 * solver (`actor.pos` is never written). Agnostic to who produced the intent, so it also drives AI
 * cars unchanged.
 *
 * The car turns from **real per-wheel tyre forces**: each wheel sees its own velocity (it sits at a
 * different point of the rotating body), hence its own slip angle, hence a linear lateral force
 * `Fy = −Cα·α` (no friction circle yet). Those forces sum into the net `Fx`/`Fy` and a yaw torque
 * `Mz`, so the yaw rate now **emerges** from the geometry instead of being scripted — `yawRate` is
 * genuinely independent of the velocity direction. The longitudinal propulsion stays the Step 0
 * "tracer" at the COG (no yaw torque from it). The actuation smoothing (shared with human/AI
 * sources) lives here, not in the input system.
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
     * forces, integrates one rigid-body step, and rotates the heading by the resulting yaw.
     *
     * Longitudinal tracer at the COG (Step 0, no yaw torque): throttle drive (signed by reverse
     * gear) plus a brake force opposing motion, with linear drag as the force `−m·dragCoeff·v_x` so
     * the integrator stays purely force-driven. Per wheel: take its velocity (it rotates with the
     * body), its slip angle (front wheels subtract the steering `δ`, rear wheels `0`), and the
     * linear lateral force `Fy = −Cα·α`. The front-wheel force is **rotated by `δ`** back into the
     * body frame before summing, so even at wide steer the curve stays faithful. Summing the forces
     * gives `Fx`/`Fy`; summing their moments `r_i_x·F_i_y − r_i_y·F_i_x` gives the yaw torque `Mz`,
     * from which the yaw rate emerges. The brake cannot push the car past zero into the opposite
     * direction (it stops at standstill).
     */
    private integrateMotion(vehicle: PhysicVehicleActor, dt: number): void {
        const vx = vehicle.velBody.x;
        const vy = vehicle.velBody.y;
        const omega = vehicle.yawRate;
        const mass = vehicle.totalMass;

        const driveDir = vehicle.isReverse ? -1 : 1;
        const driveForce = vehicle.throttleInput * vehicle.tracerDriveForce * driveDir;
        const brakeForce = vehicle.brakeInput * vehicle.tracerBrakeForce;
        const dragForce = -mass * vehicle.linearDragCoeff * vx;
        let fx = driveForce - Math.sign(vx) * brakeForce + dragForce;
        let fy = 0;
        let mz = 0;

        // Per-wheel linear tyre forces: the curve emerges from each wheel's slip angle.
        const arms = vehicle.wheelArmsBody;
        const wheels = [
            {arm: arms.frontLeftWheel, isFront: true},
            {arm: arms.frontRightWheel, isFront: true},
            {arm: arms.rearLeftWheel, isFront: false},
            {arm: arms.rearRightWheel, isFront: false},
        ];
        let slipFrontSum = 0;
        let slipRearSum = 0;
        for (const {arm, isFront} of wheels) {
            const delta = isFront ? vehicle.steeringAngle : 0;
            const cAlpha = isFront ? vehicle.corneringStiffnessFront : vehicle.corneringStiffnessRear;
            const wv = wheelVelocity(vx, vy, omega, arm);
            const alpha = slipAngle(wv.x, wv.y, delta);
            const fLat = lateralForceLinear(alpha, cAlpha); // lateral force in the wheel frame
            // Rotate the wheel-frame force (0, fLat) by δ into the body frame (rear: δ = 0 -> no-op).
            const fwx = -fLat * Math.sin(delta);
            const fwy = fLat * Math.cos(delta);
            fx += fwx;
            fy += fwy;
            mz += arm.x * fwy - arm.y * fwx;
            if (isFront) slipFrontSum += alpha; else slipRearSum += alpha;
        }
        vehicle.slipAngleFront = slipFrontSum / 2;
        vehicle.slipAngleRear = slipRearSum / 2;

        const next = integrateBody({vx, vy, omega}, fx, fy, mz, mass, vehicle.Iz, dt);
        // Braking decelerates but never reverses the car on its own: clamp to standstill on overshoot.
        if (driveForce === 0 && brakeForce > 0 && vx !== 0 && Math.sign(next.vx) !== Math.sign(vx)) {
            next.vx = 0;
        }

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