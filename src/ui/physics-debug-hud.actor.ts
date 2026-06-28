import {Canvas, Engine, ScreenElement} from "excalibur";
import {PhysicVehicleActor} from "@/actors/physic-vehicle.actor";
import {MIN_TYRE_WEAR, V_FLOOR} from "@/constants/physics.constants";

const HUD_WIDTH = 240;
const HUD_HEIGHT = 480;
const LINE_HEIGHT = 22;
// Columns of the per-wheel 2x2 grid (FL/FR over RL/RR), mirroring the car seen from above.
const COL_LEFT_X = 30;
const COL_RIGHT_X = 140;
const COLOR_NORMAL = 'rgba(255, 255, 0, 1)';     // also lateral-only saturation (the "basso" case)
const COLOR_WHEELSPIN = 'rgba(255, 160, 40, 1)'; // longitudinal saturation, drive side
const COLOR_SATURATED = 'rgba(255, 80, 80, 1)';  // longitudinal saturation, brake side (lockup)
const COLOR_WEAR_ALERT = 'rgba(255, 80, 80, 1)'; // tyre wear near the MIN_TYRE_WEAR floor
// Wear is highlighted once it gets within this margin of the floor (an almost-spent tyre).
const WEAR_ALERT_MARGIN = 0.1;
const COLOR_LOADED = 'rgba(80, 220, 80, 1)';   // bar fill when the wheel is loaded above static
const COLOR_UNLOADED = 'rgba(255, 80, 80, 1)'; // bar fill when the wheel is unloaded below static
// Per-wheel load bar, drawn right of the Fz number, centred on the static load (tick), filling right
// (loaded) or left (unloaded) by |ΔFz| relative to static.
const BAR_X_OFFSET = 54;
const BAR_WIDTH = 38;
const BAR_HEIGHT = 9;

/**
 * Minimal debug overlay for the physics dev scene. It grows step by step; it now shows the vehicle
 * speed (km/h) with the gear, the smoothed gas/brake pedals, the longitudinal acceleration (m/s²),
 * the yaw rate (°/s) and the average front/rear slip angle (°), all derived from the actor's SI
 * state. Below that a 2x2 grid (FL/FR over RL/RR) shows the live per-wheel surface grip μ, static
 * load Fz (N) and slip angle (°), with the cell turning **orange + WSP** on wheelspin and **red + LCK**
 * on lockup (longitudinal saturation), and staying **yellow** for a purely lateral saturation — so
 * sensing, load split and the type of sliding can be verified at a glance while driving.
 * Each cell also carries a **load bar** centred on the static load: it fills right (green) when the
 * wheel is loaded above static, left (red) when below, making the load transfer visible while driving.
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
        ctx.fillStyle = COLOR_NORMAL;
        ctx.font = '16px monospace';
        ctx.textBaseline = 'middle';

        // Drivetrain + power-limited engine readout: F_drive in kN, with "PL" when the engine is
        // power-limited (P/v < F_max), i.e. running on the P/v branch rather than the F_max ceiling.
        const drivetrain = v ? v.drivetrain.toUpperCase() : '-';
        const driveKn = v ? v.driveForce / 1000 : 0;
        const powerLimited = v ? v.enginePower / Math.max(Math.abs(v.velBody.x), V_FLOOR) < v.maxDriveForce : false;

        this.line(ctx, `v: ${speedKmh.toFixed(1)} km/h  [${gear}]`, 0);
        this.line(ctx, `gas: ${gas.toFixed(2)}  brake: ${brake.toFixed(2)}`, 1);
        this.line(ctx, `aLong: ${aLong.toFixed(2)} m/s²`, 2);
        this.line(ctx, `yaw: ${yawRateDeg.toFixed(1)} °/s`, 3);
        this.line(ctx, `slip f/r: ${slipFrontDeg.toFixed(1)}° / ${slipRearDeg.toFixed(1)}°`, 4);
        this.line(ctx, `${drivetrain}  Fdrv: ${driveKn.toFixed(1)} kN${powerLimited ? '  PL' : ''}`, 5);

        // Fuel row (Step 6): current fuel in kg and % of capacity, so the slow burn (and the car
        // getting lighter) is readable while driving; turns red when the tank is empty (engine cut).
        const fuelKg = v ? v.fuelMass : 0;
        const fuelPct = v && v.fuelCapacity > 0 ? (v.fuelMass / v.fuelCapacity) * 100 : 0;
        ctx.fillStyle = fuelKg > 0 ? COLOR_NORMAL : COLOR_SATURATED;
        this.line(ctx, `fuel: ${fuelKg.toFixed(1)} kg (${Math.round(fuelPct)}%)`, 6);
        ctx.fillStyle = COLOR_NORMAL;

        // Metric statistics (Step 6): total distance travelled (km) and last stopping distance (m).
        const distKm = v ? v.stats.distanceTraveled / 1000 : 0;
        const brakeM = v ? v.stats.lastBrakingDistance : 0;
        this.line(ctx, `dist: ${distKm.toFixed(2)} km`, 7);
        this.line(ctx, `brake: ${brakeM.toFixed(1)} m`, 8);

        // Per-wheel grid, mirroring the car: FL/FR on top, RL/RR below. Each cell shows grip μ, load
        // Fz, slip (°) and longitudinal force Fx, turning red when the tyre saturates the friction circle.
        this.wheelCell(ctx, v, 'frontLeftWheel', 'FL', COL_LEFT_X, 9);
        this.wheelCell(ctx, v, 'frontRightWheel', 'FR', COL_RIGHT_X, 9);
        this.wheelCell(ctx, v, 'rearLeftWheel', 'RL', COL_LEFT_X, 15);
        this.wheelCell(ctx, v, 'rearRightWheel', 'RR', COL_RIGHT_X, 15);
        ctx.fillStyle = COLOR_NORMAL;
    }

    /**
     * Draws one wheel block (label[+token], μ, Fz, slip, Fx, wear) at a column. The cell colour encodes
     * the longitudinal saturation: **orange** + `WSP` for wheelspin, **red** + `LCK` for lockup, and
     * **yellow** (no token) for either no saturation or a purely lateral one (the "basso" case). The
     * wear row turns **red** on its own once it is within {@link WEAR_ALERT_MARGIN} of the floor.
     */
    private wheelCell(ctx: CanvasRenderingContext2D, vehicle: PhysicVehicleActor | null, name: string, label: string, x: number, topRow: number): void {
        const ws = vehicle?.wheelStates.get(name);
        const cellColor = ws?.lockup ? COLOR_SATURATED : ws?.wheelspin ? COLOR_WHEELSPIN : COLOR_NORMAL;
        const token = ws?.wheelspin ? ' WSP' : ws?.lockup ? ' LCK' : '';
        ctx.fillStyle = cellColor;
        const slipDeg = (ws?.slipAngle ?? 0) * 180 / Math.PI;
        this.cell(ctx, `${label}${token}`, x, topRow);
        this.cell(ctx, `μ ${(ws?.gripSurface ?? 0).toFixed(2)}`, x, topRow + 1);
        this.cell(ctx, `${Math.round(ws?.load ?? 0)}N`, x, topRow + 2);
        this.loadBar(ctx, x + BAR_X_OFFSET, topRow + 2, ws?.load ?? 0, ws?.loadStatic ?? 0);
        ctx.fillStyle = cellColor;
        this.cell(ctx, `${slipDeg.toFixed(1)}°`, x, topRow + 3);
        this.cell(ctx, `fx ${Math.round(ws?.longitudinalForce ?? 0)}`, x, topRow + 4);
        // Tyre wear % (Step 6), highlighted red near the floor so a spent tyre stands out at a glance.
        const wear = ws?.wear ?? 1;
        ctx.fillStyle = wear <= MIN_TYRE_WEAR + WEAR_ALERT_MARGIN ? COLOR_WEAR_ALERT : cellColor;
        this.cell(ctx, `wear ${Math.round(wear * 100)}%`, x, topRow + 5);
    }

    /**
     * Draws the per-wheel load bar at column `x`, row `rowIndex`. A centre tick marks the static load;
     * the bar fills toward the right (green) when the dynamic load is above static, toward the left
     * (red) when below, with length proportional to |ΔFz| / static (clamped to a full half-bar at a
     * 100% change). Makes the longitudinal/lateral load transfer readable at a glance while driving.
     */
    private loadBar(ctx: CanvasRenderingContext2D, x: number, rowIndex: number, load: number, loadStatic: number): void {
        const yCenter = LINE_HEIGHT / 2 + rowIndex * LINE_HEIGHT;
        const top = yCenter - BAR_HEIGHT / 2;
        const cx = x + BAR_WIDTH / 2;
        ctx.strokeStyle = COLOR_NORMAL;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, top, BAR_WIDTH, BAR_HEIGHT);
        if (loadStatic > 0) {
            const frac = Math.max(-1, Math.min(1, (load - loadStatic) / loadStatic));
            const len = Math.abs(frac) * (BAR_WIDTH / 2);
            ctx.fillStyle = frac >= 0 ? COLOR_LOADED : COLOR_UNLOADED;
            ctx.fillRect(frac >= 0 ? cx : cx - len, top + 1, len, BAR_HEIGHT - 2);
        }
        // Centre tick = static baseline.
        ctx.fillStyle = COLOR_NORMAL;
        ctx.fillRect(cx, top - 1, 1, BAR_HEIGHT + 2);
    }

    private line(ctx: CanvasRenderingContext2D, text: string, index: number): void {
        ctx.fillText(text, 6, LINE_HEIGHT / 2 + index * LINE_HEIGHT);
    }

    private cell(ctx: CanvasRenderingContext2D, text: string, x: number, index: number): void {
        ctx.fillText(text, x, LINE_HEIGHT / 2 + index * LINE_HEIGHT);
    }
}