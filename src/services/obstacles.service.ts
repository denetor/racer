import {PluginObject, TilesetResource} from "@excaliburjs/plugin-tiled";
import {Actor, CollisionType} from "excalibur";

export class ObstaclesService {


    static setObstacles(map: TilesetResource): void {
        if (!map) return;
        const obstacleObjects: PluginObject[] = map.getObjectsByClassName('obstacle');
        if (!obstacleObjects) return;
        for (const obstacleObject of obstacleObjects) {
            const obstacleActor: Actor = map.getEntityByObject(obstacleObject) as Actor;
            if (obstacleActor) {
                obstacleActor.addTag('obstacle');
                obstacleActor.body.collisionType = CollisionType.Fixed;
            }
        }
    }
}