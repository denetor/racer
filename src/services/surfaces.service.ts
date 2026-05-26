import {PluginObject, TiledResource} from "@excaliburjs/plugin-tiled";
import {SurfaceActor} from "@/actors/surface.actor";

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
                switch (surfaceObject.properties.get('terraintype')) {
                    case 'tarmac':
                        surfaceActor.powerFactor = 1.0;
                        surfaceActor.dragFactor = 0.05;
                        surfaceActor.gripFactor = 1.0;
                        break;
                    case 'grass':
                        surfaceActor.powerFactor = 0.6;
                        surfaceActor.dragFactor = 0.5;
                        surfaceActor.gripFactor = 0.3;
                        break;
                    case 'grass':
                        surfaceActor.powerFactor = 0.6;
                        surfaceActor.dragFactor = 0.5;
                        surfaceActor.gripFactor = 0.3;
                        break;
                    case 'graveltrap':
                        surfaceActor.powerFactor = 0.3;
                        surfaceActor.dragFactor = 0.8;
                        surfaceActor.gripFactor = 0.5;
                        break;
                    default:
                        surfaceActor.powerFactor = 1.0;
                        surfaceActor.dragFactor = 0.05;
                        surfaceActor.gripFactor = 1.0;
                }
            }
        }
    }


}