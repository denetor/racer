import { ImageSource, Loader } from "excalibur";
import {TiledResource} from "@excaliburjs/plugin-tiled";
import {CheckpointActor} from "@/actors/checkpoint.actor";

// It is convenient to put your resources in one place
export const Resources = {
  ObjectsSpritesheet: new ImageSource('./images/spritesheets/spritesheet_objects.png'),
  TilesSpritesheet: new ImageSource('./images/spritesheets/spritesheet_tiles.png'),
  VehiclesSpritesheet: new ImageSource('./images/spritesheets/spritesheet_vehicles.png'),
  // tiled maps
  playgroundMap: new TiledResource(
      './tiled/track-playground.tmx',
      {
        strict: false,
        entityClassNameFactories: {
            checkpoint: CheckpointActor.factory,
        },
        // useTilemapCameraStrategy: true,
      }
  ),
} as const; // the 'as const' is a neat typescript trick to get strong typing on your resources. 
// So when you type Resources.Sword -> ImageSource

// We build a loader and add all of our resources to the boot loader
// You can build your own loader by extending DefaultLoader
export const loader = new Loader();
for (const res of Object.values(Resources)) {
  loader.addResource(res);
}
