import {Engine, Query, System, SystemPriority, SystemType, vec, World} from "excalibur";
import {KeybindingsService} from "@/services/keybindings.service";
import {Keybindings} from "@/enums/keybindings.enum";
import {DrivableComponent} from "@/components/drivable.component";
import {VehicleActor} from "@/actors/vehicle.actor";

export class DriveInputSystem extends System {
    private readonly _engine: Engine;
    protected query: Query<typeof DrivableComponent>;
    public priority = SystemPriority.Higher;
    public systemType = SystemType.Update;

    constructor(world: World) {
        super();
        this._engine = world.scene.engine;
        this.query = world.query([DrivableComponent]);
    }


    public update(delta: number) {
        const keyboard = this._engine.input.keyboard;

        if (this.query && this.query.entities && this.query.entities.length > 0) {
            const drivable: VehicleActor = this.query.entities[0] as VehicleActor;

            if (drivable && keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.Accelerate))) {
                drivable.vel = vec(10,0);
            }
            if (drivable && keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.Brake))) {
                drivable.vel = vec(0,0);
            }
        }
    }
}