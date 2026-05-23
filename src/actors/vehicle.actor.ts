import {Actor, Animation, AnimationStrategy, Engine, SpriteSheet, vec, Vector} from "excalibur";
import {Resources} from "@/resources";

export class VehicleActor extends Actor {
    steeringAngle: number = 0.0;
    // heading is where the vehicle is pointing. It can differ from velocity (Actor.vel)
    // that is the actual force taht moves the sprite
    heading: Vector = vec(1,0);


    constructor() {
        super({
            name: 'Vehicle',
            pos: vec(150, 150),
        });
        this.steeringAngle = 0.0;
        this.heading = vec(1,0);
    }


    onInitialize(engine: Engine) {
        super.onInitialize(engine);
        this.addTag('vehicle');

        // graphics
        const spriteSheet = SpriteSheet.fromImageSourceWithSourceViews({
            image: Resources.VehiclesSpritesheet,
            sourceViews: [
                { x: 283, y: 0, width: 70, height: 121 },
            ],
        });
        this.graphics.add('idle', new Animation({
            strategy: AnimationStrategy.Freeze,
            frames: [
                {graphic: spriteSheet.getSprite(0, 0), duration: 1000},
            ],
        }));
        this.graphics.use('idle');
        this.rotateToHeading();
    }


    /**
     * Rotates the object to face the current heading direction by adjusting its rotation property.
     * The rotation is calculated based on the arctangent of the heading vector's y and x components,
     * with a pi/2 adjustment to align correctly.
     *
     * @return {void} This method does not return a value.
     */
    private rotateToHeading(): void {
        this.rotation = Math.atan2(this.heading.y, this.heading.x) + Math.PI / 2;
    }
}