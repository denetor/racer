import {Color, DisplayMode, Engine, FadeInOut} from "excalibur";
import {loader} from "./resources";
import {PlaygroundScene} from "@/scenes/playground.scene";

// Goal is to keep main.ts small and just enough to configure the engine

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
  },
  // physics: {
  //   solver: SolverStrategy.Realistic,
  //   substep: 5 // Sub step the physics simulation for more robust simulations
  // },
  // fixedUpdateTimestep: 16 // Turn on fixed update timestep when consistent physic simulation is important
});

game.start('playground', { // name of the start scene 'start'
  loader, // Optional loader (but needed for loading images/sounds)
  inTransition: new FadeInOut({ // Optional in transition
    duration: 200,
    direction: 'in',
    color: Color.ExcaliburBlue
  })
}).then(() => {
  // Do something after the game starts
});