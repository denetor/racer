import {Engine, Scene} from "excalibur";
import {VehicleActor} from "@/actors/vehicle.actor";
import {DriveInputSystem} from "@/systems/drive-input.system";
import {DrivableComponent} from "@/components/drivable.component";
import {CameraFollowPlayerSystem} from "@/systems/camera-follow-player.system";
import {Resources} from "@/resources";

export class PlaygroundScene extends Scene {


    constructor() {
        super();
    }


    override onInitialize(engine: Engine): void {
        // read map and its properties
        Resources.playgroundMap.addToScene(this);
        
        // systems
        this.world.add(DriveInputSystem);
        this.world.add(CameraFollowPlayerSystem);

        // actors
        const player = new VehicleActor();
        if (player) {
            player.addTag('player');
            player.addComponent(new DrivableComponent());
            player.z = 10;
            this.add(player);
        }
    }


}