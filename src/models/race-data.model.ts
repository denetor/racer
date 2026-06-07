import {VehicleRaceData} from "@/models/vehicle-race-data.model";

export class RaceData {
    totalLaps: number;
    players: Map<string, VehicleRaceData>;
    started: boolean;
    finished: boolean;


    constructor(totalLaps: number) {
        this.totalLaps = totalLaps;
        this.players = new Map();
        this.started = false;
        this.finished = false;
    }


    addPlayer(playerId: string, vehicleRaceData: VehicleRaceData) {
        this.players.set(playerId, vehicleRaceData);
    }


    // TODO add debug log method
}