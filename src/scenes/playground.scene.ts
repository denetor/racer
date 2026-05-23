import {Engine, Scene} from "excalibur";
import {VehicleActor} from "@/actors/vehicle.actor";
import {DriveInputSystem} from "@/systems/drive-input.system";
import {DrivableComponent} from "@/components/drivable.component";

export class PlaygroundScene extends Scene {


    constructor() {
        super();
    }


    override onInitialize(engine: Engine): void {
        // systems
        this.world.add(DriveInputSystem);

        // actors
        const player = new VehicleActor();
        if (player) {
            player.addComponent(new DrivableComponent());
            this.add(player);
        }

    }


}