import {Engine, Query, System, SystemPriority, SystemType, World} from "excalibur";
import {KeybindingsService} from "@/services/keybindings.service";
import {Keybindings} from "@/enums/keybindings.enum";
import {DrivableComponent} from "@/components/drivable.component";
import {VehicleActor} from "@/actors/vehicle.actor";
import {sumClamp} from "@/services/math.service";
import {WheelFactor} from "@/models/wheel-factor.model";

export class DriveInputSystem extends System {
    public priority = SystemPriority.Higher;
    public systemType = SystemType.Update;
    protected query: Query<typeof DrivableComponent>;
    private readonly _engine: Engine;



    constructor(world: World) {
        super();
        this._engine = world.scene.engine;
        this.query = world.query([DrivableComponent]);
    }


    public update(delta: number) {
        const keyboard = this._engine.input.keyboard;

        if (this.query && this.query.entities && this.query.entities.length > 0) {
            const drivable: VehicleActor = this.query.entities[0] as VehicleActor;
            if (!drivable) return;
            const heading_old = drivable.heading.clone();
            const averageWheelFactors: WheelFactor = drivable.getAverageWheelFactors();

            const dt = delta / 1000;
            let speed = drivable.vel.magnitude;

            // detect user input
            const accelerating = keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.Accelerate));
            const braking = keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.Brake));
            const steeringLeft = keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.SteerLeft));
            const steeringRight = keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.SteerRight));
            // reverse gear, switchable only when still
            if (keyboard.wasPressed(KeybindingsService.getKeyFor(Keybindings.EngageReverse)) && speed === 0) {
                drivable.isReverse =!drivable.isReverse;
                console.log(`Reverse: ${drivable.isReverse}`);
            }

            // change current steering angle
            if (steeringLeft || steeringRight) {
                const steerDelta = delta * drivable.steeringSpeed / 1000 * (steeringLeft ? -1 : 1);
                drivable.steeringAngle = sumClamp(drivable.steeringAngle, steerDelta, - drivable.maxSteeringAngle, drivable.maxSteeringAngle);
            } else if (!steeringLeft && !steeringRight) {
                const steerDelta = delta * drivable.steeringReturnSpeed / 1000;
                if (drivable.steeringAngle > 0) {
                    drivable.steeringAngle = sumClamp(drivable.steeringAngle, -steerDelta, 0, drivable.maxSteeringAngle);
                } else if (drivable.steeringAngle < 0) {
                    drivable.steeringAngle = sumClamp(drivable.steeringAngle, steerDelta, - drivable.maxSteeringAngle, 0);
                }
            }

            // enable or disable throttle smoke emitter
            if (accelerating) {
                drivable.setEmitters('throttle', true);
            } else {
                drivable.setEmitters('throttle', false);
            }

            // change current speed magnitude
            if (accelerating) speed += (drivable.accelerationForce / drivable.weight) * averageWheelFactors.power * (1 - averageWheelFactors.drag) * dt;
            if (braking) speed -= ((drivable.brakingForce * averageWheelFactors.grip) / drivable.weight) * dt;
            if (!accelerating && !braking) speed -= (drivable.frictionForce * 10 * averageWheelFactors.drag / drivable.weight) * dt;
            speed = Math.min(Math.max(speed, 0), drivable.isReverse ? drivable.maxReverseSpeed : drivable.maxSpeed);

            // change current velocity (both magnitude and heading)
            const L = Math.abs(drivable.frontAxlePosition) + Math.abs(drivable.rearAxlePosition);
            const speedFactor = 1 - Math.pow(speed / drivable.maxSpeed, 2) * drivable.understeerSpeedStrength;
            const angleFactor = 1 - Math.pow(Math.abs(drivable.steeringAngle) / drivable.maxSteeringAngle, 2) * drivable.understeerAngleStrength;
            const effectiveSteering = drivable.steeringAngle * speedFactor * angleFactor * averageWheelFactors.grip;
            const deltaTheta = (speed * Math.tan(effectiveSteering) / L) * dt * (drivable.isReverse ? -1 : 1);
            drivable.heading = drivable.heading.rotate(deltaTheta)
                .normalize(); // normalize each frame to prevent floating-point magnitude drift
            drivable.vel = drivable.heading.scale(drivable.isReverse ? -speed : speed);
            drivable.pos = drivable.pos.add(
                drivable.heading.sub(heading_old).scale(drivable.rearAxlePosition)
            );
        }
    }
}