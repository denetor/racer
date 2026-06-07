import {Actor, ActorArgs, CollisionType, Engine, vec} from "excalibur";
import {FactoryProps} from "@excaliburjs/plugin-tiled";

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
            if (ev?.other?.owner?.tags?.size > 0 && ev.other.owner.tags.has('vehicle')) {
                console.log('Collision CheckpointActor-Vehicle');
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