import {Actor, Animation, AnimationStrategy, Color, Engine, SpriteSheet, vec, Vector} from "excalibur";
import {Resources} from "@/resources";

export class VehicleActor extends Actor {
    // current steering angle, in radians. 0 = no steering, negative = left, positive = right
    steeringAngle: number = 0.0;
    maxSteeringAngle: number = 0.6;
    // distance, in pixels, from vehicle center to front axle
    frontAxlePosition: number = 33;
    // vehicle weight, in kg
    weight: number = 1000.0;
    // max speed, in px/s
    maxSpeed: number = 200;
    // heading is where the vehicle is pointing. It can differ from velocity (Actor.vel)
    // that is the actual force taht moves the sprite
    heading: Vector = vec(1,0);


    constructor() {
        super({
            name: 'Vehicle',
            pos: vec(150, 150),
        });
        this.steeringAngle = 0.5;
        this.heading = vec(0,-1);
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

        // child actor: front axle
        const frontAxle = new Actor({
            name: 'frontAxle',
            width: 60,
            height: 1,
            color: Color.Yellow,
            pos: vec(0, - this.frontAxlePosition),
        });
        this.addChild(frontAxle);

        // children actors: wheels axles
        const wheelAxisRotation = this.getWheelAxisRotation();
        const leftWheelAxis = new Actor({
            name: 'leftWheelAxis',
            width: 1,
            height: 40,
            color: Color.Yellow,
            pos: vec(-frontAxle.width / 2, - this.frontAxlePosition),
            rotation: wheelAxisRotation,
        });
        const rightWheelAxis = new Actor({
            name: 'rightWheelAxis',
            width: 1,
            height: 40,
            color: Color.Yellow,
            pos: vec(frontAxle.width / 2, - this.frontAxlePosition),
            rotation: wheelAxisRotation,
        });
        this.addChild(leftWheelAxis);
        this.addChild(rightWheelAxis);

        const leftWheel = new Actor({
            name: 'leftWheelAxis',
            width: 10,
            height: 20,
            color: Color.Black,
            pos: vec(-frontAxle.width / 2, - this.frontAxlePosition),
            rotation: wheelAxisRotation,
            z: -1,
        });
        const rightWheel = new Actor({
            name: 'rightWheelAxis',
            width: 10,
            height: 20,
            color: Color.Black,
            pos: vec(frontAxle.width / 2, - this.frontAxlePosition),
            rotation: wheelAxisRotation,
            z: -1,
        });
        this.addChild(leftWheel);
        this.addChild(rightWheel);

        // rotate entire group according to current heading
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


    /**
     * Calculates the current rotation (in radians) of the wheel axis based on the steering angle.
     *
     * @return {number} The rotation angle of the wheel axis in radians.
     */
    private getWheelAxisRotation(): number {
        return this.steeringAngle;
    }
}