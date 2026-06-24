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
    public isReverse: boolean = false;  // reverse gear toggle

    // smoothed pedal inputs [0, 1] (ramped from the input targets by the update system)
    public throttleInput: number = 0;
    public brakeInput: number = 0;
    // longitudinal acceleration of the last integrated frame (m/s²), exposed for the debug HUD
    public longitudinalAccel: number = 0;

    // --- minimal per-vehicle datasheet (full datasheet arrives in Phase 4) ---
    public mass: number = 1000;         // kg
    public lengthMeters: number = 4.5;  // m; with the 121px sprite height -> pxPerMeter

    // pedal press/release rates (units per second), reused by the shared smoothPedal actuation
    public throttlePressRate: number = 5.0;
    public throttleReleaseRate: number = 5.0;
    public brakePressRate: number = 5.0;
    public brakeReleaseRate: number = 5.0;
    // steering: max angle (rad) and ramp/return speeds (rad/s); drives the front-wheel rendering only
    public maxSteeringAngle: number = 0.4;
    public steeringSpeed: number = 2.5;
    public steeringReturnSpeed: number = 2.5;

    // Placeholder "tracer" propulsion: throttle -> constant body Fx, linear drag. Replaced by the
    // real power-limited engine in a later step.
    public tracerDriveForce: number = 6000; // N at full throttle
    public tracerBrakeForce: number = 9000; // N at full brake (opposes motion)
    public linearDragCoeff: number = 0.2;   // 1/s
    // reverse can only be toggled at (near) standstill, below this speed (m/s)
    public reverseToggleMaxSpeed: number = 0.5;

    public get pxPerMeter(): number {
        return computePxPerMeter(this.lengthMeters);
    }
}
