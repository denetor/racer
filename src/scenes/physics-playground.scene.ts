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
import {PhysicVehicleActor} from "@/actors/physic-vehicle.actor";
import {DrivableComponent} from "@/components/drivable.component";
import {DriverInputComponent} from "@/components/driver-input.component";
import {PhysicsDebugHud} from "@/ui/physics-debug-hud.actor";

/**
 * Dev scene for the new force-based physics. Reuses the playground map, surfaces and obstacles, but
 * drives a {@link PhysicVehicleActor} through the two new systems plus a debug HUD. It is NOT part
 * of the Playwright baseline (only the production `playground` scene is). Full parity with
 * `PlaygroundScene` (race-data, checkpoints, laps) arrives in Phase 4.
 */
export class PhysicsPlaygroundScene extends Scene {
    override onInitialize(_engine: Engine): void {
        Resources.playgroundMap.addToScene(this);
        SurfacesService.setProperties(Resources.playgroundMap);
        ObstaclesService.setObstacles(Resources.playgroundMap);

        // input runs before the physics update (Higher vs Average priority); camera follows last
        this.world.add(PhysicDriveInputSystem);
        this.world.add(PhysicDriveUpdateSystem);
        this.world.add(CameraFollowPlayerSystem);

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
    }
}
