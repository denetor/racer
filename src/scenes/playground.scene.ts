import {Engine, Scene} from "excalibur";
import {VehicleActor} from "@/actors/vehicle.actor";

export class PlaygroundScene extends Scene {

    constructor() {
        super();
    }


    override onInitialize(engine: Engine): void {
        // Scene.onInitialize is where we recommend you perform the composition for your game
        const player = new VehicleActor();
        this.add(player); // Actors need to be added to a scene to be drawn
    }


}