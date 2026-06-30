import {PluginObject, TiledResource} from "@excaliburjs/plugin-tiled";
import {SurfaceActor} from "@/actors/surface.actor";
import {VehicleActor} from "@/actors/vehicle.actor";
import {PhysicVehicleActor} from "@/actors/physic-vehicle.actor";
import {WheelFactor} from "@/models/wheel-factor.model";
import {WheelState} from "@/models/wheel-state.model";
import {DEFAULT_SURFACE_GRIP} from "@/constants/physics.constants";

const WHEEL_NAMES = ['frontRightWheel', 'frontLeftWheel', 'rearRightWheel', 'rearLeftWheel'];

export class SurfacesService {


    /**
     * Updates the properties of surface actors in the provided Tiled map resource based on their terrain type.
     *
     * @param {TiledResource} map - The Tiled resource containing surface objects and their associated properties.
     *                               This parameter should not be null or undefined.
     * @return {void} Does not return a value. The method modifies the properties of surface actors in place.
     */
    static setProperties(map: TiledResource): void {
        if (!map) return;
        const surfaceObjects: PluginObject[] = map.getObjectsByClassName('surface');
        if (!surfaceObjects) return;
        for (const surfaceObject of surfaceObjects) {
            const surfaceActor: SurfaceActor = map.getEntityByObject(surfaceObject) as SurfaceActor;
            if (surfaceActor) {
                surfaceActor.addTag('surface');
                switch (surfaceObject.properties.get('terraintype')) {
                    case 'tarmac':
                        surfaceActor.surfaceName = 'tarmac';
                        surfaceActor.powerFactor = 1.4;
                        surfaceActor.dragFactor = 0.05;
                        surfaceActor.gripFactor = 1.0;
                        surfaceActor.addTag('surface-tarmac');
                        break;
                    case 'grass':
                        surfaceActor.surfaceName = 'grass';
                        surfaceActor.powerFactor = 0.6;
                        surfaceActor.dragFactor = 0.5;
                        surfaceActor.gripFactor = 0.5;
                        surfaceActor.addTag('surface-grass');
                        break;
                    case 'graveltrap':
                        surfaceActor.surfaceName = 'graveltrap';
                        surfaceActor.powerFactor = 0.3;
                        surfaceActor.dragFactor = 15;
                        surfaceActor.gripFactor = 0.5;
                        surfaceActor.addTag('surface-graveltrap');
                        break;
                    default:
                }
                surfaceActor.on('collisionstart', (evt) => {
                    const owner = evt?.other?.owner;
                    if (!owner || !owner.parent || !WHEEL_NAMES.includes(owner.name)) return;
                    const vehicle = owner.parent;
                    if (vehicle instanceof PhysicVehicleActor) {
                        // New force-based path: push the surface on the wheel's stack and recompute grip.
                        const state: WheelState | undefined = vehicle.wheelStates.get(owner.name);
                        if (state) {
                            state.surfaces.push(surfaceActor);
                            SurfacesService.resolveSurface(state);
                        }
                    } else if (vehicle instanceof VehicleActor) {
                        // Legacy kinematic path: update the shared WheelFactor (inert for the new actor).
                        const wheelFactor: WheelFactor = vehicle.wheelFactors.get(owner.name) || new WheelFactor();
                        wheelFactor.grip = surfaceActor.gripFactor;
                        wheelFactor.drag = surfaceActor.dragFactor;
                        wheelFactor.power = surfaceActor.powerFactor;
                    }
                });
                surfaceActor.on('collisionend', (evt) => {
                    const owner = evt?.other?.owner;
                    if (!owner || !owner.parent || !WHEEL_NAMES.includes(owner.name)) return;
                    const vehicle = owner.parent;
                    if (vehicle instanceof PhysicVehicleActor) {
                        // Remove this surface from the wheel's stack and recompute grip ("last-wins").
                        const state: WheelState | undefined = vehicle.wheelStates.get(owner.name);
                        if (state) {
                            const idx = state.surfaces.lastIndexOf(surfaceActor);
                            if (idx !== -1) state.surfaces.splice(idx, 1);
                            SurfacesService.resolveSurface(state);
                        }
                    }
                });
            }
        }
    }


    /**
     * Resolves the wheel's current surface properties from its stack: the most-recently-entered
     * surface still present wins ("last-wins"), giving both the grip μ ({@link DEFAULT_SURFACE_GRIP}
     * off every surface) and the rolling-resistance multiplier (the surface `dragFactor`, default 1.0
     * off-surface). Robust to overlapping border polygons and to the order of
     * collisionstart/collisionend events.
     */
    private static resolveSurface(state: WheelState): void {
        const top = state.surfaces[state.surfaces.length - 1];
        state.gripSurface = top ? top.gripFactor : DEFAULT_SURFACE_GRIP;
        state.rollFactor = top ? top.dragFactor : 1.0;
    }


}