import {Actor, Engine, Query, System, SystemPriority, SystemType, World} from "excalibur";
import {DebugOverlayComponent} from "@/components/debug-overlay.component";
import {KeybindingsService} from "@/services/keybindings.service";
import {Keybindings} from "@/enums/keybindings.enum";

/**
 * Single master toggle for every debug widget. On a {@link Keybindings.ToggleDebugOverlay} key press it
 * flips `visible` on each entity carrying a {@link DebugOverlayComponent} (the on-vehicle overlay and
 * the text HUD) and mirrors it onto that entity's graphics, so the two views switch together. It owns
 * no drawing and no per-frame work beyond reading the edge-triggered key — the actors render
 * themselves from their own flag.
 */
export class DebugOverlaySystem extends System {
    public priority = SystemPriority.Higher;
    public systemType = SystemType.Update;
    private query: Query<typeof DebugOverlayComponent>;
    private readonly _engine: Engine;

    constructor(world: World) {
        super();
        this._engine = world.scene.engine;
        this.query = world.query([DebugOverlayComponent]);
    }

    public update(): void {
        const keyboard = this._engine.input.keyboard;
        if (!keyboard.wasPressed(KeybindingsService.getKeyFor(Keybindings.ToggleDebugOverlay))) return;
        for (const entity of this.query.entities) {
            const overlay = entity.get(DebugOverlayComponent);
            if (!overlay) continue;
            overlay.visible = !overlay.visible;
            // Both holders are pure-graphic actors (overlay child + HUD ScreenElement), so hiding the
            // graphics is exactly the toggle — and a hidden Canvas skips its per-frame draw/calc.
            (entity as Actor).graphics.isVisible = overlay.visible;
        }
    }
}