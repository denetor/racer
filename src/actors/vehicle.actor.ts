import {vec, Vector} from "excalibur";
import {BaseVehicleActor} from "@/actors/base-vehicle.actor";
import {WheelFactor} from "@/models/wheel-factor.model";

export class VehicleActor extends BaseVehicleActor {
    // vehicle weight, in kg
    public weight: number = 1000.0;
    // vehicle acceleration force, think this as engine power
    public accelerationForce = 500000;
    // vehicle braking force, think this as braking power
    public brakingForce = 1600000;
    // vehicle friction
    public frictionForce = 80000;
    // max speed, in px/s
    public maxSpeed: number = 600;
    public maxReverseSpeed: number = 200;
    public isReverse: boolean = false;
    // heading is where the vehicle is pointing. It can differ from velocity (Actor.vel)
    // that is the actual force that moves the sprite
    public heading: Vector = vec(1, 0);
    // current acceleration: y = longitudinal (px/s²), x = lateral (px/s², 0 for now)
    public acceleration: Vector = vec(0, 0);
    // commanded speed magnitude from the previous frame (always positive; signed at use)
    public previousSpeed: number = 0;
    // current steering angle, in radians. 0 = no steering, negative = left, positive = right
    public steeringAngle: number = 0.0;
    public maxSteeringAngle: number = 0.4;
    // speed of change of steering angle, in radians/sec
    public steeringSpeed: number = 2.5;
    public steeringReturnSpeed: number = 2.5;
    // understeer: reduce steering effectiveness at high angle (0 = no effect, 1 = full reduction)
    public understeerAngleStrength: number = 0.20;
    // smoothed pedal inputs [0, 1]
    public throttleInput: number = 0;
    public brakeInput: number = 0;
    // press/release rates for each pedal (units per second)
    public throttlePressRate: number = 5.0;
    public throttleReleaseRate: number = 5.0;
    public brakePressRate: number = 5.0;
    public brakeReleaseRate: number = 5.0;
    // longitudinal load: how strongly acceleration.y shifts grip front/rear, and the
    // acceleration (px/s²) mapped to a full ±1 load
    public loadTransferStrength: number = 0.4;
    public accelerationFullScale: number = 800;
    public frontGripCap: number = 1.5;
    public baseLerpFactor: number = 0.5;


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
}
