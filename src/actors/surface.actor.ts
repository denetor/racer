import {Actor} from "excalibur";

export class SurfaceActor extends Actor {
    public dragFactor: number = 0.0;
    public powerFactor: number = 1.0;
    public gripFactor: number = 1.0;
    public surfaceName: string = 'default';
}