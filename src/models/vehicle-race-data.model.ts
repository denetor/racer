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


    hitCheckpoint(order: number, elapsed: number): void {
        const currentLap = this.laps[this.completedLaps];
        if (!currentLap) return;
        if (currentLap.checkpointTimes.has(order)) return;
        currentLap.checkpointTimes.set(order, elapsed - (currentLap.currentLapStart ?? 0));
    }


    hitFinishLine(elapsed: number, totalCheckpoints: number, totalLaps: number): void {
        if (this.laps.length === 0) {
            const lap = new LapTime(1, totalCheckpoints);
            lap.currentLapStart = elapsed;
            this.laps.push(lap);
            return;
        }

        const currentLap = this.laps[this.completedLaps];
        if (!currentLap) return;

        if (currentLap.checkpointTimes.size === currentLap.checkpoints) {
            currentLap.timeMs = elapsed - (currentLap.currentLapStart ?? 0);
            currentLap.valid = true;
            this.completedLaps++;
            console.log(`[Lap completed] Player: ${this.playerId}`, currentLap);
            console.log(`[All laps] Player: ${this.playerId}`, this.laps.map(l => ({ lap: l.lapNumber, timeMs: l.timeMs, valid: l.valid })));
            if (this.completedLaps < totalLaps) {
                const nextLap = new LapTime(this.completedLaps + 1, totalCheckpoints);
                nextLap.currentLapStart = elapsed;
                this.laps.push(nextLap);
            }
        } else {
            const missing = currentLap.checkpoints - currentLap.checkpointTimes.size;
            console.log(`[Invalid lap] Player: ${this.playerId} — missing ${missing} checkpoint(s)`);
        }
    }
}