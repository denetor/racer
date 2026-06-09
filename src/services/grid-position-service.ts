import {PluginObject, TiledResource} from "@excaliburjs/plugin-tiled";
import {GridPosition} from "@/models/grid-position.model";

export class GridPositionService {
    public static getPosition(map: TiledResource, position: number): GridPosition | undefined {
        if (!map) return;
        const positionObjects: PluginObject[] = map.getObjectsByClassName('gridposition');
        if (!positionObjects || !positionObjects[0]) return;
        const pos = new GridPosition({
            position: 1,
            x: positionObjects[0].x,
            y: positionObjects[0].y,
            heading: positionObjects[0]?.tiledObject['heading'],
        });

        return pos;
    }
}