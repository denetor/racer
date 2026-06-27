import {SurfaceActor} from "@/actors/surface.actor";
import {DEFAULT_SURFACE_GRIP} from "@/constants/physics.constants";

/**
 * Per-wheel physics state for the new force-based path (parallel to the legacy {@link WheelFactor},
 * which stays untouched for the old kinematic path). Co-owned: the {@link SurfacesService} writes
 * `gripSurface` and the surface `stack`; the `PhysicDriveUpdateSystem` writes `load`/`slipAngle`/
 * `saturated` each frame; the debug HUD reads.
 *
 * The `surfaces` stack makes surface resolution robust to overlapping border polygons and to the
 * order of collisionstart/collisionend events: the current grip is the most-recently-entered
 * surface still present ("last-wins"), or {@link DEFAULT_SURFACE_GRIP} when the stack is empty.
 */
export class WheelState {
    public gripSurface: number = DEFAULT_SURFACE_GRIP; // μ, the grip of the surface under the wheel
    public load: number = 0;                           // Fz (N), dynamic load, written every frame by the update system
    public loadStatic: number = 0;                     // Fz (N), static baseline, written every frame; the HUD bar centres on it
    public longitudinalForce: number = 0;              // Fx (N), drive/brake force after the clamp, written every frame
    public slipAngle: number = 0;                      // rad, written every frame
    public saturated: boolean = false;                 // friction-circle flag, written every frame
    public surfaces: SurfaceActor[] = [];              // stack of surfaces the wheel currently overlaps
}