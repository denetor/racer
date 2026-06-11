import {Engine, Scene, vec} from "excalibur";
import {VehicleActor} from "@/actors/vehicle.actor";
import {DriveInputSystem} from "@/systems/drive-input.system";
import {DrivableComponent} from "@/components/drivable.component";
import {CameraFollowPlayerSystem} from "@/systems/camera-follow-player.system";
import {Resources} from "@/resources";
import {SurfacesService} from "@/services/surfaces.service";
import {ObstaclesService} from "@/services/obstacles.service";
import {GridPositionService} from "@/services/grid-position-service";
import {getHeadingFromRadians} from "@/services/math.service";
import {RaceData} from "@/models/race-data.model";
import {VehicleRaceData} from "@/models/vehicle-race-data.model";
import {PluginObject} from "@excaliburjs/plugin-tiled";
import {GridPosition} from "@/models/grid-position.model";
import {DrivingDashboardActor} from "@/ui/driving-dashboard.actor";

export class PlaygroundScene extends Scene {
    raceData: RaceData;
    // time past from the scene start
    timeIntoScene: number = 0;
    dashboard!: DrivingDashboardActor;


    constructor() {
        super();
        this.raceData = new RaceData(5);
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
        const playerPosition = GridPositionService.getPosition(Resources.playgroundMap, 1) || new GridPosition();

        // actors
        const player = new VehicleActor();
        if (player) {
            player.addTag('player');
            player.addComponent(new DrivableComponent());
            player.pos = vec(playerPosition.x, playerPosition.y);
            const headingComponents = getHeadingFromRadians(playerPosition.heading);
            player.heading = vec(headingComponents.x, headingComponents.y);
            player.z = 10;
            player.playerId = 'Player1';
            this.add(player);
        }

        // UI: dashboard
        // note: canvasWidth is the physical resolution of the canvas, before applying camera zoom etc... It's nt to be used at this high level.
        // drawWidth and width are identical and have camera zoom applied
        this.dashboard = new DrivingDashboardActor(engine.screen.width);
        this.add(this.dashboard);
        this.dashboard.setVehicle(player);

        // create race
        this.raceData = new RaceData(5);
        this.raceData.addPlayer('Player1', new VehicleRaceData('Player1'));
        const checkpointObjects: PluginObject[] = Resources.playgroundMap.getObjectsByClassName('checkpoint');
        this.raceData.totalCheckpoints = checkpointObjects.filter(obj => obj.name !== 'finish-line').length;

        this.timeIntoScene = 0;
    }


    onPostUpdate(engine: Engine, elapsed: number) {
        super.onPostUpdate(engine, elapsed);
        this.timeIntoScene += elapsed;
    }


}