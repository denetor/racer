import {Canvas, Engine, ScreenElement} from "excalibur";
import {VehicleActor} from "@/actors/vehicle.actor";
import {DrivingDashboardActor} from "@/ui/driving-dashboard.actor";

export const PEDALS_MARGIN = 8;
export const PEDALS_BAR_WIDTH = 20;
export const PEDALS_GAP = 8;

export function calcBarHeight(pedalValue: number, appletSize: number): number {
    return pedalValue * appletSize;
}

export class PedalsAppletActor extends ScreenElement {
    private vehicle: VehicleActor | null = null;
    private readonly appletSize: number;

    constructor() {
        const appletSize = DrivingDashboardActor.HEIGHT - PEDALS_MARGIN * 2;
        super({
            x: PEDALS_MARGIN,
            y: PEDALS_MARGIN,
            width: appletSize,
            height: appletSize,
        });
        this.appletSize = appletSize;
    }

    onInitialize(engine: Engine): void {
        super.onInitialize(engine);
        const canvas = new Canvas({
            cache: false,
            width: this.appletSize,
            height: this.appletSize,
            draw: (ctx) => this.renderBars(ctx),
        });
        this.graphics.use(canvas);
    }

    setVehicle(vehicle: VehicleActor): void {
        this.vehicle = vehicle;
    }

    private renderBars(ctx: CanvasRenderingContext2D): void {
        const brake = this.vehicle?.brakeInput ?? 0;
        const throttle = this.vehicle?.throttleInput ?? 0;
        const size = this.appletSize;

        ctx.clearRect(0, 0, size, size);

        // track outlines
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, PEDALS_BAR_WIDTH - 1, size - 1);
        ctx.strokeRect(PEDALS_BAR_WIDTH + PEDALS_GAP + 0.5, 0.5, PEDALS_BAR_WIDTH - 1, size - 1);

        // filled bars growing bottom-up
        ctx.fillStyle = 'rgba(255, 255, 0, 1)';
        const brakeHeight = calcBarHeight(brake, size);
        if (brakeHeight > 0) {
            ctx.fillRect(0, size - brakeHeight, PEDALS_BAR_WIDTH, brakeHeight);
        }
        const throttleHeight = calcBarHeight(throttle, size);
        if (throttleHeight > 0) {
            ctx.fillRect(PEDALS_BAR_WIDTH + PEDALS_GAP, size - throttleHeight, PEDALS_BAR_WIDTH, throttleHeight);
        }
    }
}