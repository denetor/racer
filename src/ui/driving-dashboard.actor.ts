import {Color, ScreenElement} from "excalibur";

export class DrivingDashboardActor extends ScreenElement {
    constructor(width: number) {
        super({
            x: 0,
            y: 0,
            width: width,
            height: 64,
            color: Color.fromRGB(0,0,0, 0.5),
            z: 9999,
        })
    }
}