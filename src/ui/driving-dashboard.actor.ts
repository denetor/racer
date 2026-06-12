import {Color, Engine, ScreenElement} from "excalibur";
import {VehicleActor} from "@/actors/vehicle.actor";
import {PedalsAppletActor} from "@/ui/pedals-applet.actor";

export class DrivingDashboardActor extends ScreenElement {
    static readonly HEIGHT = 64;
    private vehicle: VehicleActor | null = null;
    private pedalsApplet!: PedalsAppletActor;

    constructor(width: number) {
        super({
            x: 0,
            y: 0,
            width: width,
            height: DrivingDashboardActor.HEIGHT,
            color: Color.fromRGB(0, 0, 0, 0.5),
            z: 9999,
        });
    }

    onInitialize(engine: Engine): void {
        super.onInitialize(engine);
        this.pedalsApplet = new PedalsAppletActor();
        this.addChild(this.pedalsApplet);
        if (this.vehicle) {
            this.pedalsApplet.setVehicle(this.vehicle);
        }
    }

    setVehicle(vehicle: VehicleActor): void {
        this.vehicle = vehicle;
        if (this?.pedalsApplet) {
            this.pedalsApplet.setVehicle(vehicle);
        }
    }
}
