export class LapTime {
    lapNumber: number;
    currentLapStart?: number;   // when current lap has started
    timeMs?: number;            // laptime in ms
    valid: boolean;             // if true, lap is validated
    checkpointTimes: Map<number, number>; // <checkpointOrder, timeMs>
    checkpoints: number;        // number of checkpoints to touch, apart from finishline

    constructor(lapNumber: number, ckeckpoints: number) {
        this.lapNumber = lapNumber;
        this.checkpoints = ckeckpoints;
        this.valid = false;
        this.checkpointTimes = new Map();
    }

}
