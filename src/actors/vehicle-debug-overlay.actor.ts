import {Actor, Canvas, CollisionType, Engine, vec} from "excalibur";
import type {PhysicVehicleActor} from "@/actors/physic-vehicle.actor";
import {DebugOverlayComponent} from "@/components/debug-overlay.component";
import {COLOR_NORMAL, COLOR_SATURATED, COLOR_WHEELSPIN} from "@/constants/debug-colors.constants";
import {WheelState} from "@/models/wheel-state.model";
import {Vec2} from "@/services/vehicle-physics.service";
import {forceEndpointsLocal, frictionCircleRadiusPx, loadCentroid} from "@/services/vehicle-debug.service";

// The Canvas is square and generously sized so the per-wheel friction circles (later phases) never get
// clipped where they spill past the sprite. Its centre maps to the vehicle centre (sprite local frame).
const CANVAS_SIZE = 240;
const CENTER = CANVAS_SIZE / 2;
// Static COG cross, drawn in the sprite local frame (nose-up): forward = -y, lateral = +x. Half-lengths
// span the sprite extent (≈121×70 px) so the cross frames the car.
const CROSS_HALF_LONGITUDINAL = 60; // along local y (forward axis)
const CROSS_HALF_LATERAL = 35;      // along local x (lateral axis)
// Load-centroid dot: gain on the displacement from the static COG (1 = true position, >1 exaggerates)
// and the drawn radius in px.
const DOT_GAIN = 1;
const DOT_RADIUS = 3;
// Shared Newton→pixel scale for the friction circles AND the force lines, so a force vector reaches the
// circle edge exactly at saturation. Tunable for on-screen readability.
const PX_PER_NEWTON = 0.005;
// Stable wheel order shared by every per-wheel computation (centroid weights, later circles/forces).
const WHEEL_NAMES = ['frontLeftWheel', 'frontRightWheel', 'rearLeftWheel', 'rearRightWheel'] as const;

/**
 * On-vehicle physics debug overlay (child Actor). A {@link Canvas} graphic drawn in the vehicle's local
 * sprite frame, so it inherits the vehicle position and rotation for free and needs no world→screen
 * projection. It carries its own {@link DebugOverlayComponent}, so the {@link DebugOverlaySystem}
 * commutes it together with the text HUD; when hidden, Excalibur skips the Canvas draw, so no per-frame
 * work happens while off.
 *
 * It is a thin view over the vehicle SI state: it reads what it needs each frame and renders primitives,
 * deferring the geometry maths to pure helpers as the later phases add them. For now it draws the static
 * centre-of-gravity cross, centred on `cogPosition`.
 */
export class VehicleDebugOverlay extends Actor {
    private readonly vehicle: PhysicVehicleActor;

    constructor(vehicle: PhysicVehicleActor) {
        super({pos: vec(0, 0), z: 100, collisionType: CollisionType.PreventCollision});
        this.vehicle = vehicle;
    }

    override onInitialize(_engine: Engine): void {
        this.addComponent(new DebugOverlayComponent());
        const canvas = new Canvas({
            cache: false,
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
            draw: (ctx) => this.render(ctx),
        });
        this.graphics.use(canvas);
    }

    /** Vehicle centre-of-gravity in canvas pixels: body (x fwd, y lat) m → local sprite px (x=body.y, y=-body.x). */
    private cogCanvas(): {cx: number; cy: number} {
        const ppm = this.vehicle.pxPerMeter;
        return {
            cx: CENTER + this.vehicle.cogPosition.y * ppm,
            cy: CENTER - this.vehicle.cogPosition.x * ppm,
        };
    }

    /**
     * Per-wheel colour: orange on wheelspin, red on lockup (longitudinal saturation), base yellow
     * otherwise. Same precedence and constants as the text HUD, so the circle/lines of a sliding wheel
     * stand out at a glance.
     */
    private wheelColor(ws: WheelState | undefined): string {
        if (ws?.lockup) return COLOR_SATURATED;
        if (ws?.wheelspin) return COLOR_WHEELSPIN;
        return COLOR_NORMAL;
    }

    /** Wheel positions in the local sprite frame (px), in {@link WHEEL_NAMES} order. */
    private wheelLocalPositions(): Vec2[] {
        const v = this.vehicle;
        return [
            {x: -v.frontAxleWidth / 2, y: v.frontAxlePosition},
            {x: v.frontAxleWidth / 2, y: v.frontAxlePosition},
            {x: -v.rearAxleWidth / 2, y: v.rearAxlePosition},
            {x: v.rearAxleWidth / 2, y: v.rearAxlePosition},
        ];
    }

    private render(ctx: CanvasRenderingContext2D): void {
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        this.drawFrictionCircles(ctx);
        this.drawForceLines(ctx);
        this.drawStaticCogCross(ctx);
        this.drawLoadCentroidDot(ctx);
    }

    /**
     * Per-wheel force lines: two thin segments from the wheel centre for the longitudinal and lateral
     * force components. The front wheels rotate the axes by the steering angle (rear `δ = 0`), so the
     * lines follow the steered wheel. The vector sum reaches the friction circle edge at saturation.
     */
    private drawForceLines(ctx: CanvasRenderingContext2D): void {
        const positions = this.wheelLocalPositions();
        ctx.lineWidth = 1;
        WHEEL_NAMES.forEach((name, i) => {
            const ws = this.vehicle.wheelStates.get(name);
            if (!ws) return;
            const delta = name.startsWith('front') ? this.vehicle.steeringAngle : 0;
            const ends = forceEndpointsLocal(ws.longitudinalForce, ws.lateralForce, delta, PX_PER_NEWTON);
            ctx.strokeStyle = this.wheelColor(ws);
            const wx = CENTER + positions[i].x;
            const wy = CENTER + positions[i].y;
            ctx.beginPath();
            ctx.moveTo(wx, wy);
            ctx.lineTo(wx + ends.longitudinal.x, wy + ends.longitudinal.y);
            ctx.moveTo(wx, wy);
            ctx.lineTo(wx + ends.lateral.x, wy + ends.lateral.y);
            ctx.stroke();
        });
    }

    /**
     * Per-wheel friction circle (radius `μ_eff·Fz·PX_PER_NEWTON`) centred on the wheel. The radius grows
     * on loaded wheels and shrinks on unloaded ones, so the load transfer is visible from the circle too.
     */
    private drawFrictionCircles(ctx: CanvasRenderingContext2D): void {
        const positions = this.wheelLocalPositions();
        ctx.lineWidth = 1;
        WHEEL_NAMES.forEach((name, i) => {
            const ws = this.vehicle.wheelStates.get(name);
            const muEff = (ws?.gripSurface ?? 0) * (ws?.wear ?? 1);
            const radius = frictionCircleRadiusPx(muEff, ws?.load ?? 0, PX_PER_NEWTON);
            if (radius <= 0) return;
            ctx.strokeStyle = this.wheelColor(ws);
            ctx.beginPath();
            ctx.arc(CENTER + positions[i].x, CENTER + positions[i].y, radius, 0, Math.PI * 2);
            ctx.stroke();
        });
    }

    /** Thin cross on the static COG: one line along the longitudinal axis, one along the lateral axis. */
    private drawStaticCogCross(ctx: CanvasRenderingContext2D): void {
        const {cx, cy} = this.cogCanvas();
        ctx.strokeStyle = COLOR_NORMAL;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy - CROSS_HALF_LONGITUDINAL);
        ctx.lineTo(cx, cy + CROSS_HALF_LONGITUDINAL);
        ctx.moveTo(cx - CROSS_HALF_LATERAL, cy);
        ctx.lineTo(cx + CROSS_HALF_LATERAL, cy);
        ctx.stroke();
    }

    /**
     * Dot at the dynamic load centroid (where the COG "virtually" moves under weight transfer). Computed
     * from the per-wheel dynamic vs static Fz, with {@link DOT_GAIN} on the displacement from the static
     * centroid. At rest the dynamic and static centroids coincide, so the dot sits on the cross.
     */
    private drawLoadCentroidDot(ctx: CanvasRenderingContext2D): void {
        const positions = this.wheelLocalPositions();
        const dynamicLoads = WHEEL_NAMES.map((n) => this.vehicle.wheelStates.get(n)?.load ?? 0);
        const staticLoads = WHEEL_NAMES.map((n) => this.vehicle.wheelStates.get(n)?.loadStatic ?? 0);
        const dynamic = loadCentroid(positions, dynamicLoads);
        const staticCentroid = loadCentroid(positions, staticLoads);
        const localX = staticCentroid.x + DOT_GAIN * (dynamic.x - staticCentroid.x);
        const localY = staticCentroid.y + DOT_GAIN * (dynamic.y - staticCentroid.y);
        ctx.fillStyle = COLOR_NORMAL;
        ctx.beginPath();
        ctx.arc(CENTER + localX, CENTER + localY, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }
}