import {Canvas, Engine, ScreenElement} from "excalibur";
import {PhysicVehicleActor} from "@/actors/physic-vehicle.actor";

const HUD_WIDTH = 240;
const HUD_HEIGHT = 76;
const LINE_HEIGHT = 22;

/**
 * Minimal debug overlay for the physics dev scene. It grows step by step; it now shows the vehicle
 * speed (km/h) with the gear, the smoothed gas/brake pedals and the longitudinal acceleration
 * (m/s²), all derived from the actor's SI state.
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
        const gear = v?.isReverse ? 'R' : 'D';
        const gas = v ? v.throttleInput : 0;
        const brake = v ? v.brakeInput : 0;
        const aLong = v ? v.longitudinalAccel : 0;

        ctx.clearRect(0, 0, HUD_WIDTH, HUD_HEIGHT);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, HUD_WIDTH, HUD_HEIGHT);
        ctx.fillStyle = 'rgba(255, 255, 0, 1)';
        ctx.font = '16px monospace';
        ctx.textBaseline = 'middle';

        this.line(ctx, `v: ${speedKmh.toFixed(1)} km/h  [${gear}]`, 0);
        this.line(ctx, `gas: ${gas.toFixed(2)}  brake: ${brake.toFixed(2)}`, 1);
        this.line(ctx, `aLong: ${aLong.toFixed(2)} m/s²`, 2);
    }

    private line(ctx: CanvasRenderingContext2D, text: string, index: number): void {
        ctx.fillText(text, 6, LINE_HEIGHT / 2 + index * LINE_HEIGHT);
    }
}