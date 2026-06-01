import {
    Actor,
    Animation,
    AnimationStrategy, CircleCollider,
    CollisionType,
    Color, CompositeCollider,
    Engine,
    SpriteSheet,
    vec,
    Vector
} from "excalibur";
import {Resources} from "@/resources";
import {WheelFactor} from "@/models/wheel-factor.model";

export class VehicleActor extends Actor {
    // vehicle weight, in kg
    public weight: number = 1000.0;
    // vehicle acceleration force, think this as engine power
    public accelerationForce = 300000;
    // vehicle braking force, think this as braking power
    public brakingForce = 800000;
    // vehicle friction
    public frictionForce = 30000;
    // max speed, in px/s
    public maxSpeed: number = 600;
    // heading is where the vehicle is pointing. It can differ from velocity (Actor.vel)
    // that is the actual force that moves the sprite
    public heading: Vector = vec(1, 0);
    // current steering angle, in radians. 0 = no steering, negative = left, positive = right
    public steeringAngle: number = 0.0;
    public maxSteeringAngle: number = 0.5;
    // speed of change of steering angle, in radians/sec
    public steeringSpeed: number = 1.8;
    public steeringReturnSpeed: number = 3.0;
    // understeer: reduce steering effectiveness at high speed and high angle (0 = no effect, 1 = full reduction)
    public understeerSpeedStrength: number = 0.3;
    public understeerAngleStrength: number = 0.15;
    // distance, in pixels, from vehicle center to wheel axles
    public frontAxlePosition: number = -33;
    public rearAxlePosition: number = 35;
    public frontAxleWidth: number = 60;
    public rearAxleWidth: number = 62;
    public wheelFactors: Map<string, WheelFactor> = new Map();
    // child actors
    protected leftWheelAxis: Actor = null as any;
    protected rightWheelAxis: Actor = null as any;
    protected frontLeftWheel: Actor = null as any;
    protected frontRightWheel: Actor = null as any;
    protected rearLeftWheel: Actor = null as any;
    protected rearRightWheel: Actor = null as any;


    constructor() {
        super({
            name: 'Vehicle',
            pos: vec(80, 80),
            collisionType: CollisionType.Active,
        });
        this.wheelFactors.set('frontLeftWheel', new WheelFactor());
        this.wheelFactors.set('frontRightWheel', new WheelFactor());
        this.wheelFactors.set('rearLeftWheel', new WheelFactor());
        this.wheelFactors.set('rearRightWheel', new WheelFactor());
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
            width: this.frontAxleWidth,
            height: 1,
            color: Color.Yellow,
            pos: vec(0, this.frontAxlePosition),
        });
        const rearAxle = new Actor({
            name: 'rearAxle',
            width: this.rearAxleWidth,
            height: 1,
            color: Color.Yellow,
            pos: vec(0, this.rearAxlePosition),
        });
        // this.addChild(frontAxle);
        // this.addChild(rearAxle);

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
        // this.addChild(this.leftWheelAxis);
        // this.addChild(this.rightWheelAxis);

        this.frontLeftWheel = new Actor({
            name: 'frontLeftWheel',
            width: 10,
            height: 20,
            color: Color.Black,
            pos: vec(-frontAxle.width / 2, this.frontAxlePosition),
            rotation: wheelAxisRotation,
            z: -1,
        });
        this.frontRightWheel = new Actor({
            name: 'frontRightWheel',
            width: 10,
            height: 20,
            color: Color.Black,
            pos: vec(frontAxle.width / 2, this.frontAxlePosition),
            rotation: wheelAxisRotation,
            z: -1,
        });
        this.rearLeftWheel = new Actor({
            name: 'rearLeftWheel',
            width: 10,
            height: 20,
            color: Color.Black,
            pos: vec(-rearAxle.width / 2, this.rearAxlePosition),
            z: -1,
        });
        this.rearRightWheel = new Actor({
            name: 'rearRightWheel',
            width: 10,
            height: 20,
            color: Color.Black,
            pos: vec(rearAxle.width / 2, this.rearAxlePosition),
            z: -1,
        });
        this.addChild(this.frontLeftWheel);
        this.addChild(this.frontRightWheel);
        this.addChild(this.rearLeftWheel);
        this.addChild(this.rearRightWheel);

        // colliders
        this.body.collisionType = CollisionType.Active;
        const collider1 = new CircleCollider({radius: 17, offset: vec(-17, -40)});
        const collider2 = new CircleCollider({radius: 17, offset: vec(-17, 40)});
        const collider3 = new CircleCollider({radius: 17, offset: vec(17, -40)});
        const collider4 = new CircleCollider({radius: 17, offset: vec(17, 40)});
        const collider = new CompositeCollider([collider1, collider2, collider3, collider4]);
        this.collider.set(collider);

        // rotate entire group according to current heading
        this.rotateToHeading();
    }



    onPostUpdate(engine: Engine, elapsed: number) {
        super.onPostUpdate(engine, elapsed);

        // update wheels rotation
        const wheelAxisRotation = this.getWheelAxisRotation();
        this.leftWheelAxis.rotation = wheelAxisRotation;
        this.rightWheelAxis.rotation = wheelAxisRotation;
        this.frontLeftWheel.rotation = wheelAxisRotation;
        this.frontRightWheel.rotation = wheelAxisRotation;

        // update sprite direction according to heading
        this.rotateToHeading();
    }


    getAverageWheelFactors(): WheelFactor {
        const wf = new WheelFactor();
        const fl: WheelFactor = this.wheelFactors.get('frontLeftWheel') || new WheelFactor();
        const fr: WheelFactor = this.wheelFactors.get('frontRightWheel') || new WheelFactor();
        const rl: WheelFactor = this.wheelFactors.get('rearLeftWheel') || new WheelFactor();
        const rr: WheelFactor = this.wheelFactors.get('rearRightWheel') || new WheelFactor();
        wf.drag = (fl.drag + fr.drag + rl.drag + rr.drag) / 4;
        wf.grip = (fl.grip + fr.grip + rl.grip + rr.grip) / 4;
        wf.power = (fl.power + fr.power + rl.power + rr.power) / 4;

        return wf;
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