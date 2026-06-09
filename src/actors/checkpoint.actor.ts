import {Actor, ActorArgs, CollisionType, Engine, vec} from "excalibur";
import {FactoryProps} from "@excaliburjs/plugin-tiled";
import {VehicleActor} from "@/actors/vehicle.actor";
import {PlaygroundScene} from "@/scenes/playground.scene";

export class CheckpointActor extends Actor {


    constructor(config?: ActorArgs) {
        super({
            ...config,
            collisionType: CollisionType.Passive,
        });
    }


    onInitialize(engine: Engine) {
        super.onInitialize(engine);
        this.addTag('checkpoint');

        this.on('collisionstart', (ev) => {
            if (!ev?.other?.owner?.tags?.has('vehicle')) return;

            const vehicle = ev.other.owner as VehicleActor;
            const raceData = (this.scene as PlaygroundScene).raceData;
            const vehicleData = raceData.players.get(vehicle.playerId);
            if (!vehicleData) return;
            if (raceData.finished) return;

            const timeIntoScene = (this.scene as PlaygroundScene).timeIntoScene;

            if (this.name === 'finish-line') {
                vehicleData.hitFinishLine(timeIntoScene, raceData.totalCheckpoints, raceData.totalLaps);
                if (vehicleData.completedLaps >= raceData.totalLaps) {
                    raceData.finished = true;
                }
            } else {
                const order = parseInt(this.name.split('-').pop() ?? '0', 10);
                vehicleData.hitCheckpoint(order, timeIntoScene);
            }
        });
    }


    static factory(props: FactoryProps): CheckpointActor {
        return new CheckpointActor({
            anchor: vec(0, 0),
            pos: vec(props.object.x, props.object.y),
            width: props.object.width,
            height: props.object.height,
            name: props.name,
        });
    }


}