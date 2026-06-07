import {LapTime} from "@/models/lap-time.model";

export class VehicleRaceData {
    playerId: string;
    laps: LapTime[];
    completedLaps: number;


    constructor(playerId: string) {
        this.playerId = playerId;
        this.laps = [];
        this.completedLaps = 0;
    }

    // TODO startedLap method
    // TODO completedLap method
}