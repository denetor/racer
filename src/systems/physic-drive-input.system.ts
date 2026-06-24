import {Engine, Query, System, SystemPriority, SystemType, World} from "excalibur";
import {KeybindingsService} from "@/services/keybindings.service";
import {Keybindings} from "@/enums/keybindings.enum";
import {DrivableComponent} from "@/components/drivable.component";
import {DriverInputComponent} from "@/components/driver-input.component";

/**
 * Pure input translator. Reads the keyboard for human-driven cars (marked with
 * {@link DrivableComponent}) and writes normalized targets into their {@link DriverInputComponent}.
 * No smoothing, no physics — a future AiDriveInputSystem fills the same component for computer cars.
 *
 * Runs at `Higher` priority so the intent is ready before the physics update consumes it.
 */
export class PhysicDriveInputSystem extends System {
    public priority = SystemPriority.Higher;
    public systemType = SystemType.Update;
    private query: Query<typeof DrivableComponent>;
    private readonly _engine: Engine;

    constructor(world: World) {
        super();
        this._engine = world.scene.engine;
        this.query = world.query([DrivableComponent]);
    }

    public update(): void {
        const keyboard = this._engine.input.keyboard;
        const throttle = keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.Accelerate)) ? 1 : 0;
        const brake = keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.Brake)) ? 1 : 0;
        const steerLeft = keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.SteerLeft));
        const steerRight = keyboard.isHeld(KeybindingsService.getKeyFor(Keybindings.SteerRight));
        const steer = (steerLeft ? -1 : 0) + (steerRight ? 1 : 0); // [-1, 1]; both held cancels out
        const reverseRequested = keyboard.wasPressed(KeybindingsService.getKeyFor(Keybindings.EngageReverse));

        for (const entity of this.query.entities) {
            const input = entity.get(DriverInputComponent);
            if (!input) continue;
            input.throttleTarget = throttle;
            input.brakeTarget = brake;
            input.steerTarget = steer;
            // Latch the edge-triggered press; the update system clears it once consumed.
            if (reverseRequested) input.reverseToggleRequested = true;
        }
    }
}