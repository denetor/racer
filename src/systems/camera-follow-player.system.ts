import {Scene, System, SystemPriority, SystemType, World} from "excalibur";
import {VehicleActor} from "@/actors/vehicle.actor";

export class CameraFollowPlayerSystem extends System {
    scene: Scene;
    query: any;
    public priority = SystemPriority.Lower;
    public systemType = SystemType.Update;


    constructor(world: World) {
        super();
        this.query = world.query({tags: {any: ['player']}});
        this.scene = world.scene;
    }


    public update(delta: number) {
        if (this.query && this.query.entities && this.query.entities.length > 0) {
            const player: VehicleActor = this.query.entities[0] as VehicleActor;
            const camera = player?.scene?.camera;
            if (!camera) return;
            // note: player.pos is not changed by add() method
            const newPos = player.pos.add(player.heading.normalize().scale(200));
            camera.pos.x = newPos.x;
            camera.pos.y = newPos.y;
        }
    }

}