import {Canvas, Engine, ScreenElement} from "excalibur";
import {PhysicVehicleActor} from "@/actors/physic-vehicle.actor";

const HUD_WIDTH = 220;
const HUD_HEIGHT = 28;

/**
 * Minimal debug overlay for the physics dev scene. It grows step by step; for Step 0 / Phase 2 it
 * shows the vehicle speed in km/h, derived from the SI body velocity.
 */
export class PhysicsDebugHud extends ScreenElement {
    private vehicle: PhysicVehicleActor | null = null;

    constructor() {
        super({x: 8, y: 8, width: HUD_WIDTH, height: HUD_HEIGHT, z: 9999});
    }

    onInitialize(engine: Engine): void {
        super.onInitialize(engine);
        const canvas = new Canvas({
            cache: false,
            width: HUD_WIDTH,
            height: HUD_HEIGHT,
            draw: (ctx) => this.render(ctx),
        });
        this.graphics.use(canvas);
    }

    setVehicle(vehicle: PhysicVehicleActor): void {
        this.vehicle = vehicle;
    }

    private render(ctx: CanvasRenderingContext2D): void {
        const v = this.vehicle;
        const speedKmh = v ? Math.hypot(v.velBody.x, v.velBody.y) * 3.6 : 0;

        ctx.clearRect(0, 0, HUD_WIDTH, HUD_HEIGHT);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, HUD_WIDTH, HUD_HEIGHT);
        ctx.fillStyle = 'rgba(255, 255, 0, 1)';
        ctx.font = '16px monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText(`v: ${speedKmh.toFixed(1)} km/h`, 6, HUD_HEIGHT / 2);
    }
}
