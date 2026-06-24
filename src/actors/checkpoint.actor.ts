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
            if (ev?.other?.owner?.name !== 'laptimeTransponder') return;
            if (!ev?.other?.owner?.parent) return;

            const vehicle = ev.other.owner.parent as VehicleActor;
            const raceData = (this.scene as PlaygroundScene).raceData;
            if (!raceData) return;
            const vehicleData = raceData.players.get(vehicle.playerId);
            if (!vehicleData) return;
            if (raceData.finished) return;

            const timeIntoScene = (this.scene as PlaygroundScene).timeIntoScene;

            if (this.name === 'finish-line') {
                console.log('Finish-line passage');
                vehicleData.hitFinishLine(timeIntoScene, raceData.totalCheckpoints, raceData.totalLaps);
                if (vehicleData.completedLaps >= raceData.totalLaps) {
                    raceData.finished = true;
                }
            } else {
                console.log('Checkpoint passage');
                const order = parseInt(this.name.split('-').pop() ?? '0', 10);
                vehicleData.hitCheckpoint(order, timeIntoScene);
            }
        });
    }


    static factory(props: FactoryProps): CheckpointActor {
        return new CheckpointActor({
            anchor: vec(0, 0),
            pos: vec(props.object.x, props.object.y),
            width: (props.object as any)?.width,
            height: (props.object as any)?.height,
            name: props.name,
        });
    }


}