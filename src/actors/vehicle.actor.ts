import {Actor, Animation, AnimationStrategy, Color, Engine, SpriteSheet, vec, Vector} from "excalibur";
import {Resources} from "@/resources";

export class VehicleActor extends Actor {
    // vehicle weight, in kg
    public weight: number = 1000.0;
    // vehicle acceleration force, think this as engine power
    public accelerationForce = 200000;
    // vehicle braking force, think this as braking power
    public brakingForce = 500000;
    // vehicle friction
    public frictionForce = 30000;
    // max speed, in px/s
    public maxSpeed: number = 400;
    // heading is where the vehicle is pointing. It can differ from velocity (Actor.vel)
    // that is the actual force taht moves the sprite
    public heading: Vector = vec(1, 0);
    public speed: number = 0;
    // current steering angle, in radians. 0 = no steering, negative = left, positive = right
    public steeringAngle: number = 0.0;
    public maxSteeringAngle: number = 0.4;
    // speed of change of steering angle, in radians/sec
    public steeringSpeed: number = 1.8;
    public steeringReturnSpeed: number = 2.8;
    // distance, in pixels, from vehicle center to wheel axles
    protected frontAxlePosition: number = -33;
    protected rearAxlePosition: number = 50;
    // child actors
    protected leftWheelAxis: Actor = null as any;
    protected rightWheelAxis: Actor = null as any;
    protected leftWheel: Actor = null as any;
    protected rightWheel: Actor = null as any;


    constructor() {
        super({
            name: 'Vehicle',
            pos: vec(80, 80),
        });
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

        // children actors: front and read axles
        const frontAxle = new Actor({
            name: 'frontAxle',
            width: 60,
            height: 1,
            color: Color.Yellow,
            pos: vec(0, this.frontAxlePosition),
        });
        const rearAxle = new Actor({
            name: 'rearAxle',
            width: 60,
            height: 1,
            color: Color.Yellow,
            pos: vec(0, this.rearAxlePosition),
        });
        this.addChild(frontAxle);
        this.addChild(rearAxle);

        // children actors: wheels axles
        const wheelAxisRotation = this.getWheelAxisRotation();
        this.leftWheelAxis = new Actor({
            name: 'leftWheelAxis',
            width: 1,
            height: 40,
            color: Color.Yellow,
            pos: vec(-frontAxle.width / 2, this.frontAxlePosition),
            rotation: wheelAxisRotation,
        });
        this.rightWheelAxis = new Actor({
            name: 'rightWheelAxis',
            width: 1,
            height: 40,
            color: Color.Yellow,
            pos: vec(frontAxle.width / 2, this.frontAxlePosition),
            rotation: wheelAxisRotation,
        });
        this.addChild(this.leftWheelAxis);
        this.addChild(this.rightWheelAxis);

        this.leftWheel = new Actor({
            name: 'leftWheelAxis',
            width: 10,
            height: 20,
            color: Color.Black,
            pos: vec(-frontAxle.width / 2, this.frontAxlePosition),
            rotation: wheelAxisRotation,
            z: -1,
        });
        this.rightWheel = new Actor({
            name: 'rightWheelAxis',
            width: 10,
            height: 20,
            color: Color.Black,
            pos: vec(frontAxle.width / 2, this.frontAxlePosition),
            rotation: wheelAxisRotation,
            z: -1,
        });
        this.addChild(this.leftWheel);
        this.addChild(this.rightWheel);

        // rotate entire group according to current heading
        this.rotateToHeading();
    }



    onPostUpdate(engine: Engine, elapsed: number) {
        super.onPostUpdate(engine, elapsed);

        // update wheels rotation
        const wheelAxisRotation = this.getWheelAxisRotation();
        this.leftWheelAxis.rotation = wheelAxisRotation;
        this.rightWheelAxis.rotation = wheelAxisRotation;
        this.leftWheel.rotation = wheelAxisRotation;
        this.rightWheel.rotation = wheelAxisRotation;

        const dt = elapsed / 1000;
        const L = Math.abs(this.frontAxlePosition) + Math.abs(this.rearAxlePosition);
        const deltaTheta = (this.speed * Math.tan(this.steeringAngle) / L) * dt;
        this.heading = this.heading.rotate(deltaTheta);
        this.vel = this.heading.normalize().scale(this.speed);
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