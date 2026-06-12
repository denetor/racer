import {Canvas, Engine, ScreenElement} from "excalibur";
import {VehicleActor} from "@/actors/vehicle.actor";
import {DrivingDashboardActor} from "@/ui/driving-dashboard.actor";
import {PEDALS_MARGIN} from "@/ui/pedals-applet.actor";

const ACCELERATION_DOT_RADIUS = 6;
const ACCELERATION_BOUNDARY_RADIUS_MARGIN = 4;

export function calcDotOffset(weightTransfer: number, boundaryRadius: number): { x: number, y: number } {
    return {x: 0, y: (-weightTransfer * boundaryRadius) || 0};
}

export class AccelerationAppletActor extends ScreenElement {
    private vehicle: VehicleActor | null = null;
    private readonly appletSize: number;
    private readonly boundaryRadius: number;

    constructor() {
        const appletSize = DrivingDashboardActor.HEIGHT - PEDALS_MARGIN * 2;
        super({
            x: PEDALS_MARGIN + appletSize + PEDALS_MARGIN,
            y: PEDALS_MARGIN,
            width: appletSize,
            height: appletSize,
        });
        this.appletSize = appletSize;
        this.boundaryRadius = appletSize / 2 - ACCELERATION_BOUNDARY_RADIUS_MARGIN;
    }

    onInitialize(engine: Engine): void {
        super.onInitialize(engine);
        const canvas = new Canvas({
            cache: false,
            width: this.appletSize,
            height: this.appletSize,
            draw: (ctx) => this.renderIndicator(ctx),
        });
        this.graphics.use(canvas);
    }

    setVehicle(vehicle: VehicleActor): void {
        this.vehicle = vehicle;
    }

    private renderIndicator(ctx: CanvasRenderingContext2D): void {
        const weightTransfer = this.vehicle?.weightTransfer ?? 0;
        const size = this.appletSize;
        const cx = size / 2;
        const cy = size / 2;

        ctx.clearRect(0, 0, size, size);

        ctx.strokeStyle = 'rgba(255, 255, 0, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, this.boundaryRadius, 0, Math.PI * 2);
        ctx.stroke();

        const offset = calcDotOffset(weightTransfer, this.boundaryRadius);
        ctx.fillStyle = 'rgba(255, 255, 0, 1)';
        ctx.beginPath();
        ctx.arc(cx + offset.x, cy + offset.y, ACCELERATION_DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }
}