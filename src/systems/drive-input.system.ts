import {Engine, Query, System, SystemPriority, SystemType, World} from "excalibur";
import {KeybindingsService} from "@/services/keybindings.service";
import {Keybindings} from "@/enums/keybindings.enum";
import {DrivableComponent} from "@/components/drivable.component";
import {VehicleActor} from "@/actors/vehicle.actor";
import {MathService} from "@/services/math.service";

export class DriveInputSystem extends System {
    public priority = SystemPriority.Higher;
    public systemType = SystemType.Update;
    protected query: Query<typeof DrivableComponent>;
    private readonly _engine: Engine;
    private accelerationForce = 80000;
    private brakingForce = 150000;
    private frictionForce = 30000;


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

            const dt = delta / 1000;
            const dir = drivable.heading.normalize();
            let speed = drivable.vel.magnitude;

            const accelerating = keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.Accelerate));
            const braking = keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.Brake));
            const steeringLeft = keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.SteerLeft));
            const steeringRight = keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.SteerRight));

            if (accelerating) speed += (this.accelerationForce / drivable.weight) * dt;
            if (braking) speed -= (this.brakingForce / drivable.weight) * dt;
            if (!accelerating && !braking) speed -= (this.frictionForce / drivable.weight) * dt;

            if (steeringLeft || steeringRight) {
                const steerDelta = delta * drivable.steeringSpeed / 1000 * (steeringLeft ? -1 : 1);
                drivable.steeringAngle = MathService.sumClamp(drivable.steeringAngle, steerDelta, - drivable.maxSteeringAngle, drivable.maxSteeringAngle);
            } else if (!steeringLeft && !steeringRight) {
                const steerDelta = delta * drivable.steeringReturnSpeed / 1000;
                if (drivable.steeringAngle > 0) {
                    drivable.steeringAngle = MathService.sumClamp(drivable.steeringAngle, -steerDelta, 0, drivable.maxSteeringAngle);
                } else if (drivable.steeringAngle < 0) {
                    drivable.steeringAngle = MathService.sumClamp(drivable.steeringAngle, steerDelta, - drivable.maxSteeringAngle, 0);
                }
            }

            speed = Math.min(Math.max(speed, 0), drivable.maxSpeed);
            drivable.vel = dir.scale(speed);
        }
    }
}