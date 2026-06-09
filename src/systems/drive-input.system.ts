import {Engine, Keyboard, Query, System, SystemPriority, SystemType, World} from "excalibur";
import {KeybindingsService} from "@/services/keybindings.service";
import {Keybindings} from "@/enums/keybindings.enum";
import {DrivableComponent} from "@/components/drivable.component";
import {VehicleActor} from "@/actors/vehicle.actor";
import {computeGripFactors, moveToward, smoothPedal, sumClamp} from "@/services/math.service";
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
        this.updatePedalInputs(drivable, input, delta);
        this.updateWeightTransfer(drivable, delta);
        this.updateThrottleEffects(drivable, input);
        const speed = this.computeSpeed(drivable, delta);
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

    private updatePedalInputs(drivable: VehicleActor, input: InputState, delta: number) {
        const dt = delta / 1000;
        drivable.throttleInput = smoothPedal(drivable.throttleInput, input.accelerating, drivable.throttlePressRate, drivable.throttleReleaseRate, dt);
        drivable.brakeInput = smoothPedal(drivable.brakeInput, input.braking, drivable.brakePressRate, drivable.brakeReleaseRate, dt);
    }

    private updateWeightTransfer(drivable: VehicleActor, delta: number) {
        const dt = delta / 1000;
        const target = Math.min(Math.max(drivable.throttleInput - drivable.brakeInput, -1), 1);
        drivable.weightTransfer = moveToward(drivable.weightTransfer, target, drivable.weightTransferRate * dt);
    }

    private updateThrottleEffects(drivable: VehicleActor, input: InputState) {
        drivable.setEmitters('throttle', input.accelerating);
    }

    private computeSpeed(drivable: VehicleActor, delta: number): number {
        const dt = delta / 1000;
        const averageWheelFactors: WheelFactor = drivable.getAverageWheelFactors();
        let speed = drivable.vel.magnitude;

        speed += (drivable.accelerationForce / drivable.weight) * drivable.throttleInput * averageWheelFactors.power * (1 - averageWheelFactors.drag) * dt;
        speed -= ((drivable.brakingForce * averageWheelFactors.grip) / drivable.weight) * drivable.brakeInput * dt;
        if (drivable.throttleInput === 0 && drivable.brakeInput === 0) speed -= (drivable.frictionForce * 10 * averageWheelFactors.drag / drivable.weight) * dt;

        return Math.min(Math.max(speed, 0), drivable.isReverse ? drivable.maxReverseSpeed : drivable.maxSpeed);
    }

    private applyKinematics(drivable: VehicleActor, speed: number, delta: number) {
        const dt = delta / 1000;
        const heading_old = drivable.heading.clone();
        const surfaceGrip: number = drivable.getAverageWheelFactors().grip;

        const speedDampening = 1 - Math.pow(speed / drivable.maxSpeed, 2);
        const { frontGrip, rearGrip } = computeGripFactors(
            drivable.weightTransfer,
            speedDampening,
            drivable.weightTransferStrength,
            drivable.frontGripCap
        );

        const L = Math.abs(drivable.frontAxlePosition) + Math.abs(drivable.rearAxlePosition);
        const angleFactor = 1 - Math.pow(Math.abs(drivable.steeringAngle) / drivable.maxSteeringAngle, 2) * drivable.understeerAngleStrength;
        const effectiveSteering = drivable.steeringAngle * angleFactor * surfaceGrip * frontGrip;
        const deltaTheta = (speed * Math.tan(effectiveSteering) / L) * dt * (drivable.isReverse ? -1 : 1);

        drivable.heading = drivable.heading.rotate(deltaTheta)
            .normalize(); // normalize each frame to prevent floating-point magnitude drift

        const lerpFactor = drivable.baseLerpFactor * rearGrip * surfaceGrip;
        const targetVel = drivable.heading.scale(drivable.isReverse ? -speed : speed);
        drivable.vel = drivable.vel.lerp(targetVel, lerpFactor);

        drivable.pos = drivable.pos.add(
            drivable.heading.sub(heading_old).scale(drivable.rearAxlePosition)
        );
    }
}