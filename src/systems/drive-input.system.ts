import {Engine, Keyboard, Query, System, SystemPriority, SystemType, World} from "excalibur";
import {KeybindingsService} from "@/services/keybindings.service";
import {Keybindings} from "@/enums/keybindings.enum";
import {DrivableComponent} from "@/components/drivable.component";
import {VehicleActor} from "@/actors/vehicle.actor";
import {sumClamp} from "@/services/math.service";
import {WheelFactor} from "@/models/wheel-factor.model";

interface InputState {
    accelerating: boolean;
    braking: boolean;
    steeringLeft: boolean;
    steeringRight: boolean;
    reversePressed: boolean;
}

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
        if (!this.query?.entities?.length) return;
        const drivable = this.query.entities[0] as VehicleActor;
        if (!drivable) return;

        const input = this.readInput(this._engine.input.keyboard);

        this.handleReverseToggle(drivable, input);
        this.updateSteeringAngle(drivable, input, delta);
        this.updateThrottleEffects(drivable, input);
        const speed = this.computeSpeed(drivable, input, delta);
        this.applyKinematics(drivable, speed, delta);
    }

    private readInput(keyboard: Keyboard): InputState {
        return {
            accelerating:   keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.Accelerate)),
            braking:        keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.Brake)),
            steeringLeft:   keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.SteerLeft)),
            steeringRight:  keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.SteerRight)),
            reversePressed: keyboard.wasPressed(KeybindingsService.getKeyFor(Keybindings.EngageReverse)),
        };
    }

    private handleReverseToggle(drivable: VehicleActor, input: InputState) {
        if (input.reversePressed && drivable.vel.magnitude === 0) {
            drivable.isReverse = !drivable.isReverse;
            console.log(`Reverse: ${drivable.isReverse}`);
        }
    }

    private updateSteeringAngle(drivable: VehicleActor, input: InputState, delta: number) {
        if (input.steeringLeft || input.steeringRight) {
            const steerDelta = delta * drivable.steeringSpeed / 1000 * (input.steeringLeft ? -1 : 1);
            drivable.steeringAngle = sumClamp(drivable.steeringAngle, steerDelta, -drivable.maxSteeringAngle, drivable.maxSteeringAngle);
        } else {
            const steerDelta = delta * drivable.steeringReturnSpeed / 1000;
            if (drivable.steeringAngle > 0) {
                drivable.steeringAngle = sumClamp(drivable.steeringAngle, -steerDelta, 0, drivable.maxSteeringAngle);
            } else if (drivable.steeringAngle < 0) {
                drivable.steeringAngle = sumClamp(drivable.steeringAngle, steerDelta, -drivable.maxSteeringAngle, 0);
            }
        }
    }

    private updateThrottleEffects(drivable: VehicleActor, input: InputState) {
        drivable.setEmitters('throttle', input.accelerating);
    }

    private computeSpeed(drivable: VehicleActor, input: InputState, delta: number): number {
        const dt = delta / 1000;
        const averageWheelFactors: WheelFactor = drivable.getAverageWheelFactors();
        let speed = drivable.vel.magnitude;

        if (input.accelerating) speed += (drivable.accelerationForce / drivable.weight) * averageWheelFactors.power * (1 - averageWheelFactors.drag) * dt;
        if (input.braking) speed -= ((drivable.brakingForce * averageWheelFactors.grip) / drivable.weight) * dt;
        if (!input.accelerating && !input.braking) speed -= (drivable.frictionForce * 10 * averageWheelFactors.drag / drivable.weight) * dt;

        return Math.min(Math.max(speed, 0), drivable.isReverse ? drivable.maxReverseSpeed : drivable.maxSpeed);
    }

    private applyKinematics(drivable: VehicleActor, speed: number, delta: number) {
        const dt = delta / 1000;
        const heading_old = drivable.heading.clone();
        const averageWheelFactors: WheelFactor = drivable.getAverageWheelFactors();

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