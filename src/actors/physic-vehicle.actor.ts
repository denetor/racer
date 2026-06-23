import {vec, Vector} from "excalibur";
import {BaseVehicleActor} from "@/actors/base-vehicle.actor";
import {pxPerMeter as computePxPerMeter} from "@/services/vehicle-physics.service";

/**
 * Force-based vehicle. Shares the visual setup with {@link BaseVehicleActor} and adds the planar
 * rigid-body state in SI units (body frame: x = forward, y = lateral). Position and collisions are
 * owned by Excalibur; velocity is our source of truth and written to `actor.vel` each frame.
 *
 * Step 0 / Phase 2 carries only the minimal datasheet needed by the straight-line tracer; the full
 * per-vehicle datasheet (cog, Iz, Cα, drivetrain, fuel, ...) is filled in Phase 4.
 */
export class PhysicVehicleActor extends BaseVehicleActor {
    // motion state required by the visual base (writable: the drive systems mutate them)
    public heading: Vector = vec(1, 0);
    public steeringAngle: number = 0;

    // planar rigid-body state in SI, body frame (x = forward, y = lateral)
    public velBody: Vector = vec(0, 0); // m/s
    public yawRate: number = 0;         // rad/s

    // --- minimal per-vehicle datasheet (full datasheet arrives in Phase 4) ---
    public mass: number = 1000;         // kg
    public lengthMeters: number = 4.5;  // m; with the 121px sprite height -> pxPerMeter

    // Placeholder "tracer" propulsion: throttle -> constant body Fx, linear drag. Replaced by the
    // real power-limited engine in a later step.
    public tracerDriveForce: number = 6000; // N at full throttle
    public linearDragCoeff: number = 0.2;   // 1/s

    public get pxPerMeter(): number {
        return computePxPerMeter(this.lengthMeters);
    }
}
