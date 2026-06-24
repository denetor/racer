import {Query, System, SystemPriority, SystemType, vec, World} from "excalibur";
import {DriverInputComponent} from "@/components/driver-input.component";
import {PhysicVehicleActor} from "@/actors/physic-vehicle.actor";
import {bodyToWorld, integrateLongitudinalStep} from "@/services/vehicle-physics.service";
import {smoothPedal, sumClamp} from "@/services/math.service";

/**
 * Applies the physics. Reads the driving intent ({@link DriverInputComponent}), actuates it
 * (pedal/steer smoothing) and integrates the placeholder longitudinal "tracer" dynamics in SI,
 * then writes the world velocity (px/s) to the actor. Position and collisions are left to
 * Excalibur's Arcade solver. Agnostic to who produced the intent, so it also drives AI cars
 * unchanged.
 *
 * Still straight-line only: throttle/brake/reverse act on the longitudinal axis; steering smooths
 * and rotates the front wheels visually but does NOT curve the car (no lateral force, no yaw until
 * Step 1). The actuation smoothing (shared with human/AI sources) lives here, not in the input system.
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
            this.integrateLongitudinal(entity, dt);

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
     * Integrates one straight-line step: throttle drive (signed by reverse gear) plus brake force
     * opposing the current motion, through the SI longitudinal integrator. The brake cannot push the
     * car past zero into the opposite direction (it stops at standstill). Records the resulting
     * longitudinal acceleration for the HUD and writes the world velocity in px.
     */
    private integrateLongitudinal(vehicle: PhysicVehicleActor, dt: number): void {
        const vx = vehicle.velBody.x;
        const driveDir = vehicle.isReverse ? -1 : 1;
        const driveForce = vehicle.throttleInput * vehicle.tracerDriveForce * driveDir;
        const brakeForce = vehicle.brakeInput * vehicle.tracerBrakeForce;
        const fx = driveForce - Math.sign(vx) * brakeForce;

        let vxNew = integrateLongitudinalStep(vx, fx, vehicle.mass, vehicle.linearDragCoeff, dt);
        // Braking decelerates but never reverses the car on its own: clamp to standstill on overshoot.
        if (driveForce === 0 && brakeForce > 0 && vx !== 0 && Math.sign(vxNew) !== Math.sign(vx)) {
            vxNew = 0;
        }

        vehicle.longitudinalAccel = dt > 0 ? (vxNew - vx) / dt : 0;
        vehicle.velBody = vec(vxNew, 0); // straight line: no lateral velocity, no yaw yet

        const theta = Math.atan2(vehicle.heading.y, vehicle.heading.x);
        const worldVel = bodyToWorld(vehicle.velBody, theta);
        vehicle.vel = vec(worldVel.x * vehicle.pxPerMeter, worldVel.y * vehicle.pxPerMeter);
    }
}