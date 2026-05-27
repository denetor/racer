import {PluginObject, TiledResource} from "@excaliburjs/plugin-tiled";
import {SurfaceActor} from "@/actors/surface.actor";
import {VehicleActor} from "@/actors/vehicle.actor";
import {WheelFactor} from "@/models/grip-factor.model";

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
                        surfaceActor.powerFactor = 1.0;
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
                        surfaceActor.dragFactor = 0.8;
                        surfaceActor.gripFactor = 1.3;
                        surfaceActor.addTag('surface-graveltrap');
                        break;
                    default:
                }
                surfaceActor.on('collisionstart', (evt) => {
                    if (evt.other && evt.other && evt.other.owner && evt.other.owner.parent && ['frontRightWheel', 'frontLeftWheel', 'rearRightWheel', 'rearLeftWheel'].includes(evt.other.owner.name)) {
                        console.log(`${evt.other.owner.name} entering ${surfaceActor.name}`);
                        const vehicle: VehicleActor = evt.other.owner.parent as VehicleActor;
                        const wheelFactor: WheelFactor = vehicle.wheelFactors.get(evt.other.owner.name);
                        wheelFactor.grip = surfaceActor.gripFactor;
                        wheelFactor.drag = surfaceActor.dragFactor;
                        wheelFactor.power = surfaceActor.powerFactor;
                    }
                });
            }
        }
    }


}