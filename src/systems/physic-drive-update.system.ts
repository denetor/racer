import {Query, System, SystemPriority, SystemType, vec, World} from "excalibur";
import {DriverInputComponent} from "@/components/driver-input.component";
import {PhysicVehicleActor} from "@/actors/physic-vehicle.actor";
import {bodyToWorld, integrateLongitudinalStep} from "@/services/vehicle-physics.service";

/**
 * Applies the physics. Reads the driving intent ({@link DriverInputComponent}) and integrates the
 * placeholder longitudinal "tracer" dynamics in SI, then writes the world velocity (px/s) to the
 * actor. Position and collisions are left to Excalibur's Arcade solver. Agnostic to who produced
 * the intent, so it also drives AI cars unchanged.
 *
 * Phase 2 is straight-line only: no lateral velocity, no yaw. Steering, braking and reverse arrive
 * in Phase 3.
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

            const fx = input.throttleTarget * entity.tracerDriveForce;
            const vxNew = integrateLongitudinalStep(entity.velBody.x, fx, entity.mass, entity.linearDragCoeff, dt);
            entity.velBody = vec(vxNew, 0); // straight line: no lateral velocity, no yaw yet

            const theta = Math.atan2(entity.heading.y, entity.heading.x);
            const worldVel = bodyToWorld(entity.velBody, theta);
            entity.vel = vec(worldVel.x * entity.pxPerMeter, worldVel.y * entity.pxPerMeter);
        }
    }
}
