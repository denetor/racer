import {PluginObject, TilesetResource} from "@excaliburjs/plugin-tiled";
import {GridPosition} from "@/models/grid-position.model";

export class GridPositionService {
    public static getPosition(map: TilesetResource, position: number): GridPosition {
        if (!map) return;
        const positionObjects: PluginObject[] = map.getObjectsByClassName('gridposition');
        if (!positionObjects || !positionObjects[0]) return;
        const pos = new GridPosition({
            position: 1,
            x: positionObjects[0].x,
            y: positionObjects[0].y,
            heading: positionObjects[0].tiledObject['heading'],
        });

        return pos;
    }
}