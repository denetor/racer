import {Canvas, Engine, ScreenElement} from "excalibur";
import {PhysicVehicleActor} from "@/actors/physic-vehicle.actor";

const HUD_WIDTH = 240;
const HUD_HEIGHT = 210;
const LINE_HEIGHT = 22;
// Columns of the per-wheel 2x2 grid (FL/FR over RL/RR), mirroring the car seen from above.
const COL_LEFT_X = 30;
const COL_RIGHT_X = 140;

/**
 * Minimal debug overlay for the physics dev scene. It grows step by step; it now shows the vehicle
 * speed (km/h) with the gear, the smoothed gas/brake pedals, the longitudinal acceleration (m/s²),
 * the yaw rate (°/s) and the average front/rear slip angle (°), all derived from the actor's SI
 * state. Below that a 2x2 grid (FL/FR over RL/RR) shows the live per-wheel surface grip μ, so the
 * per-wheel surface sensing can be verified end-to-end while driving.
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
        const yawRateDeg = v ? v.yawRate * 180 / Math.PI : 0;
        const slipFrontDeg = v ? v.slipAngleFront * 180 / Math.PI : 0;
        const slipRearDeg = v ? v.slipAngleRear * 180 / Math.PI : 0;

        ctx.clearRect(0, 0, HUD_WIDTH, HUD_HEIGHT);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, HUD_WIDTH, HUD_HEIGHT);
        ctx.fillStyle = 'rgba(255, 255, 0, 1)';
        ctx.font = '16px monospace';
        ctx.textBaseline = 'middle';

        this.line(ctx, `v: ${speedKmh.toFixed(1)} km/h  [${gear}]`, 0);
        this.line(ctx, `gas: ${gas.toFixed(2)}  brake: ${brake.toFixed(2)}`, 1);
        this.line(ctx, `aLong: ${aLong.toFixed(2)} m/s²`, 2);
        this.line(ctx, `yaw: ${yawRateDeg.toFixed(1)} °/s`, 3);
        this.line(ctx, `slip f/r: ${slipFrontDeg.toFixed(1)}° / ${slipRearDeg.toFixed(1)}°`, 4);

        // Per-wheel grip grid, mirroring the car: FL/FR on top, RL/RR below.
        const grip = (name: string): string => (v?.wheelStates.get(name)?.gripSurface ?? 0).toFixed(2);
        this.cell(ctx, 'FL', COL_LEFT_X, 5);
        this.cell(ctx, 'FR', COL_RIGHT_X, 5);
        this.cell(ctx, `μ ${grip('frontLeftWheel')}`, COL_LEFT_X, 6);
        this.cell(ctx, `μ ${grip('frontRightWheel')}`, COL_RIGHT_X, 6);
        this.cell(ctx, 'RL', COL_LEFT_X, 7);
        this.cell(ctx, 'RR', COL_RIGHT_X, 7);
        this.cell(ctx, `μ ${grip('rearLeftWheel')}`, COL_LEFT_X, 8);
        this.cell(ctx, `μ ${grip('rearRightWheel')}`, COL_RIGHT_X, 8);
    }

    private line(ctx: CanvasRenderingContext2D, text: string, index: number): void {
        ctx.fillText(text, 6, LINE_HEIGHT / 2 + index * LINE_HEIGHT);
    }

    private cell(ctx: CanvasRenderingContext2D, text: string, x: number, index: number): void {
        ctx.fillText(text, x, LINE_HEIGHT / 2 + index * LINE_HEIGHT);
    }
}