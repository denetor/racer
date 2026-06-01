import {Engine, Scene, vec} from "excalibur";
import {VehicleActor} from "@/actors/vehicle.actor";
import {DriveInputSystem} from "@/systems/drive-input.system";
import {DrivableComponent} from "@/components/drivable.component";
import {CameraFollowPlayerSystem} from "@/systems/camera-follow-player.system";
import {Resources} from "@/resources";
import {SurfacesService} from "@/services/surfaces.service";
import {ObstaclesService} from "@/services/obstacles.service";
import {GridPositionService} from "@/services/grid-position-service";
import {MathService} from "@/services/math.service";

export class PlaygroundScene extends Scene {


    constructor() {
        super();
    }


    override onInitialize(engine: Engine): void {
        // read map and its properties
        Resources.playgroundMap.addToScene(this);
        SurfacesService.setProperties(Resources.playgroundMap);
        ObstaclesService.setObstacles(Resources.playgroundMap);

        // systems
        this.world.add(DriveInputSystem);
        this.world.add(CameraFollowPlayerSystem);

        // get player position in map
        const playerPosition = GridPositionService.getPosition(Resources.playgroundMap, 1);

        // actors
        const player = new VehicleActor();
        if (player) {
            player.addTag('player');
            player.addComponent(new DrivableComponent());
            player.pos = vec(playerPosition.x, playerPosition.y);
            const headingComponents = MathService.getHeadingFromRadians(playerPosition.heading);
            player.heading = vec(headingComponents.x, headingComponents.y);
            player.z = 10;
            this.add(player);
        }
    }


}