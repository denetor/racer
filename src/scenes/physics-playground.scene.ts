import {Engine, Scene, vec} from "excalibur";
import {Resources} from "@/resources";
import {SurfacesService} from "@/services/surfaces.service";
import {ObstaclesService} from "@/services/obstacles.service";
import {GridPositionService} from "@/services/grid-position-service";
import {GridPosition} from "@/models/grid-position.model";
import {getHeadingFromRadians} from "@/services/math.service";
import {CameraFollowPlayerSystem} from "@/systems/camera-follow-player.system";
import {PhysicDriveInputSystem} from "@/systems/physic-drive-input.system";
import {PhysicDriveUpdateSystem} from "@/systems/physic-drive-update.system";
import {DebugOverlaySystem} from "@/systems/debug-overlay.system";
import {PhysicVehicleActor} from "@/actors/physic-vehicle.actor";
import {DrivableComponent} from "@/components/drivable.component";
import {DriverInputComponent} from "@/components/driver-input.component";
import {PhysicsDebugHud} from "@/ui/physics-debug-hud.actor";
import {RaceData} from "@/models/race-data.model";
import {VehicleRaceData} from "@/models/vehicle-race-data.model";
import {PluginObject} from "@excaliburjs/plugin-tiled";

/**
 * Dev scene for the new force-based physics. At parity with `PlaygroundScene` (same map, surfaces,
 * obstacles, race-data, checkpoints, laps and laptime), but drives a {@link PhysicVehicleActor}
 * through the two new systems and shows a {@link PhysicsDebugHud} instead of the `DrivingDashboard`.
 *
 * It exposes `raceData`/`timeIntoScene` with the same shape `PlaygroundScene` does, so the shared
 * {@link CheckpointActor} (auto-created by the Tiled factory) drives lap timing here unchanged. It is
 * NOT part of the Playwright baseline — only the production `playground` scene is.
 */
export class PhysicsPlaygroundScene extends Scene {
    raceData: RaceData;
    // time elapsed since the scene start (ms), read by the checkpoint actors for laptimes
    timeIntoScene: number = 0;

    constructor() {
        super();
        this.raceData = new RaceData(5);
    }

    override onInitialize(_engine: Engine): void {
        Resources.playgroundMap.addToScene(this);
        SurfacesService.setProperties(Resources.playgroundMap);
        ObstaclesService.setObstacles(Resources.playgroundMap);

        // input runs before the physics update (Higher vs Average priority); camera follows last
        this.world.add(PhysicDriveInputSystem);
        this.world.add(PhysicDriveUpdateSystem);
        this.world.add(CameraFollowPlayerSystem);
        this.world.add(DebugOverlaySystem);

        const playerPosition = GridPositionService.getPosition(Resources.playgroundMap, 1) || new GridPosition();
        const player = new PhysicVehicleActor();
        player.addTag('player');
        player.addComponent(new DrivableComponent());
        player.addComponent(new DriverInputComponent());
        player.pos = vec(playerPosition.x, playerPosition.y);
        const headingComponents = getHeadingFromRadians(playerPosition.heading);
        player.heading = vec(headingComponents.x, headingComponents.y);
        player.z = 10;
        player.playerId = 'Player1';
        this.add(player);

        const hud = new PhysicsDebugHud();
        this.add(hud);
        hud.setVehicle(player);

        // race data: parity with PlaygroundScene (laps, checkpoints, laptime)
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