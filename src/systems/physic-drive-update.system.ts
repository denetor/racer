import {Query, System, SystemPriority, SystemType, vec, World} from "excalibur";
import {DriverInputComponent} from "@/components/driver-input.component";
import {PhysicVehicleActor} from "@/actors/physic-vehicle.actor";
import {bodyToWorld, integrateBody, kinematicYawRate} from "@/services/vehicle-physics.service";
import {smoothPedal, sumClamp} from "@/services/math.service";

/**
 * Applies the physics. Reads the driving intent ({@link DriverInputComponent}), actuates it
 * (pedal/steer smoothing) and integrates the planar rigid-body dynamics in SI, then writes the
 * world velocity (px/s) to the actor. Position and collisions are left to Excalibur's Arcade
 * solver (`actor.pos` is never written). Agnostic to who produced the intent, so it also drives AI
 * cars unchanged.
 *
 * The car now turns: the heading rotates by the yaw rate each frame and carries the velocity into
 * the world frame. In this step the yaw is **kinematic** (bicycle formula `ω = v_x·tan(δ)/L`,
 * applied at all speeds) and the only real force is the Step 0 longitudinal "tracer" at the COG —
 * the per-wheel tyre forces that make yaw emergent arrive in the next phase. The actuation
 * smoothing (shared with human/AI sources) lives here, not in the input system.
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
     * Integrates one rigid-body step and rotates the heading by the yaw.
     *
     * The yaw is **kinematic** in this step: `ω = v_x·tan(δ)/L` from the bicycle model, applied at
     * all speeds (the emergent per-wheel torque arrives in the next phase). The only real force is
     * the Step 0 longitudinal "tracer" at the COG — throttle drive (signed by reverse gear) plus a
     * brake force opposing motion, with linear drag expressed as the force `−m·dragCoeff·v_x` so the
     * rigid-body integrator stays purely force-driven. The lateral force is the kinematic centripetal
     * term `m·v_x·ω`: it keeps the velocity locked to the heading (no slip yet) so the path curves
     * with radius `v/ω`; the real, slip-driven lateral force replaces it next phase. The brake cannot
     * push the car past zero into the opposite direction (it stops at standstill).
     */
    private integrateMotion(vehicle: PhysicVehicleActor, dt: number): void {
        const vx = vehicle.velBody.x;
        const vy = vehicle.velBody.y;
        const mass = vehicle.totalMass;

        const driveDir = vehicle.isReverse ? -1 : 1;
        const driveForce = vehicle.throttleInput * vehicle.tracerDriveForce * driveDir;
        const brakeForce = vehicle.brakeInput * vehicle.tracerBrakeForce;
        const dragForce = -mass * vehicle.linearDragCoeff * vx;
        const fx = driveForce - Math.sign(vx) * brakeForce + dragForce;

        const omega = kinematicYawRate(vx, vehicle.steeringAngle, vehicle.wheelbaseMeters);
        const fy = mass * vx * omega; // kinematic centripetal force (no yaw torque: Mz = 0)

        const next = integrateBody({vx, vy, omega}, fx, fy, 0, mass, vehicle.Iz, dt);
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