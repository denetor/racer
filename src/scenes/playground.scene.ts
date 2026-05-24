import {Actor, Color, Engine, Scene, vec} from "excalibur";
import {VehicleActor} from "@/actors/vehicle.actor";
import {DriveInputSystem} from "@/systems/drive-input.system";
import {DrivableComponent} from "@/components/drivable.component";
import {CameraFollowPlayerSystem} from "@/systems/camera-follow-player.system";

export class PlaygroundScene extends Scene {


    constructor() {
        super();
    }


    override onInitialize(engine: Engine): void {
        // systems
        this.world.add(DriveInputSystem);
        this.world.add(CameraFollowPlayerSystem);

        // actors
        const player = new VehicleActor();
        if (player) {
            player.addTag('player');
            player.addComponent(new DrivableComponent());
            this.add(player);
        }

        // add a couple of fixed objects for visual reference
        const cube = new Actor({
            width: 100,
            height: 100,
            color: Color.Gray,
            pos: vec(200,200),
        });
        const circle = new Actor({
            radius: 150,
            color: Color.Green,
            pos: vec(600,400),
        });
        this.add(cube);
        this.add(circle);
    }


}