import {Color, DisplayMode, Engine, FadeInOut, SolverStrategy} from "excalibur";
import {loader} from "./resources";
import {PlaygroundScene} from "@/scenes/playground.scene";
import {PhysicsPlaygroundScene} from "@/scenes/physics-playground.scene";

// Goal is to keep main.ts small and just enough to configure the engine

// Start scene. The force-based model is now the production scene (Step 6 switch): 'physics'
// (PhysicsPlaygroundScene) is the committed start scene, and the Playwright baseline screenshots it.
// The old kinematic model ('playground'/PlaygroundScene) stays in the repo as an orphan fallback.
// const START_SCENE = 'playground'; // legacy kinematic model (orphan)
const START_SCENE = 'physics';

const game = new Engine({
  width: 1200, // Logical width and height in game pixels
  height: 900,
  // displayMode: DisplayMode.FitScreenAndFill, // Display mode tells excalibur how to fill the window
  displayMode: DisplayMode.Fixed,
  pixelArt: true, // pixelArt will turn on the correct settings to render pixel art without jaggies or shimmering artifacts
  antialiasing: false,
  suppressHiDPIScaling: true,
  suppressPlayButton: true,
  scenes: {
    playground: PlaygroundScene,
    physics: PhysicsPlaygroundScene,
  },
  physics: {
    solver: SolverStrategy.Arcade
  },
  // physics: {
  //   solver: SolverStrategy.Realistic,
  //   substep: 5 // Sub step the physics simulation for more robust simulations
  // },
  // fixed update keeps the force-based integration stable and deterministic (constant dt)
  fixedUpdateFps: 60,
});

game.start(START_SCENE, { // name of the start scene 'start'
  loader, // Optional loader (but needed for loading images/sounds)
  inTransition: new FadeInOut({ // Optional in transition
    duration: 200,
    direction: 'in',
    color: Color.ExcaliburBlue
  })
}).then(() => {
  // Do something after the game starts
});