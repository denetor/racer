import {VehicleRaceData} from './vehicle-race-data.model';

const TOTAL_CHECKPOINTS = 3;
const TOTAL_LAPS = 5;

function makeData(): VehicleRaceData {
    return new VehicleRaceData('Player1');
}

function startLap(data: VehicleRaceData, startElapsed = 1000): void {
    data.hitFinishLine(startElapsed, TOTAL_CHECKPOINTS, TOTAL_LAPS);
}

function hitAllCheckpoints(data: VehicleRaceData, startElapsed = 1000): void {
    data.hitCheckpoint(1, startElapsed + 100);
    data.hitCheckpoint(2, startElapsed + 200);
    data.hitCheckpoint(3, startElapsed + 300);
}

describe('VehicleRaceData', () => {
    describe('hitCheckpoint', () => {
        it('ignores checkpoint hits before the first finish-line crossing', () => {
            const data = makeData();
            data.hitCheckpoint(1, 500);
            expect(data.laps).toHaveLength(0);
        });

        it('records checkpoint time delta during an active lap', () => {
            const data = makeData();
            startLap(data, 1000);
            data.hitCheckpoint(2, 1250);
            expect(data.laps[0].checkpointTimes.get(2)).toBe(250);
        });

        it('ignores a duplicate checkpoint hit within the same lap', () => {
            const data = makeData();
            startLap(data, 1000);
            data.hitCheckpoint(1, 1100);
            data.hitCheckpoint(1, 1200);
            expect(data.laps[0].checkpointTimes.get(1)).toBe(100);
        });
    });

    describe('hitFinishLine — lap start', () => {
        it('creates lap 1 on first finish-line crossing', () => {
            const data = makeData();
            startLap(data, 1000);
            expect(data.laps).toHaveLength(1);
            expect(data.laps[0].lapNumber).toBe(1);
            expect(data.laps[0].currentLapStart).toBe(1000);
        });

        it('does not increment completedLaps on first crossing', () => {
            const data = makeData();
            startLap(data, 1000);
            expect(data.completedLaps).toBe(0);
        });
    });

    describe('hitFinishLine — lap completion', () => {
        it('does not validate a lap when checkpoints are missing', () => {
            const data = makeData();
            startLap(data, 1000);
            data.hitCheckpoint(1, 1100);
            data.hitFinishLine(2000, TOTAL_CHECKPOINTS, TOTAL_LAPS);
            expect(data.laps[0].valid).toBe(false);
            expect(data.completedLaps).toBe(0);
        });

        it('validates a lap when all checkpoints are touched', () => {
            const data = makeData();
            startLap(data, 1000);
            hitAllCheckpoints(data, 1000);
            data.hitFinishLine(2000, TOTAL_CHECKPOINTS, TOTAL_LAPS);
            expect(data.laps[0].valid).toBe(true);
            expect(data.completedLaps).toBe(1);
        });

        it('computes timeMs as the delta between finish and lap start', () => {
            const data = makeData();
            startLap(data, 1000);
            hitAllCheckpoints(data, 1000);
            data.hitFinishLine(3500, TOTAL_CHECKPOINTS, TOTAL_LAPS);
            expect(data.laps[0].timeMs).toBe(2500);
        });

        it('starts the next lap immediately after a valid completion', () => {
            const data = makeData();
            startLap(data, 1000);
            hitAllCheckpoints(data, 1000);
            data.hitFinishLine(2000, TOTAL_CHECKPOINTS, TOTAL_LAPS);
            expect(data.laps).toHaveLength(2);
            expect(data.laps[1].lapNumber).toBe(2);
            expect(data.laps[1].currentLapStart).toBe(2000);
        });

        it('does not start a new lap after the last lap is completed', () => {
            const data = makeData();
            for (let i = 0; i < TOTAL_LAPS; i++) {
                const start = i * 10000;
                data.hitFinishLine(start, TOTAL_CHECKPOINTS, TOTAL_LAPS);
                hitAllCheckpoints(data, start);
                data.hitFinishLine(start + 5000, TOTAL_CHECKPOINTS, TOTAL_LAPS);
            }
            expect(data.completedLaps).toBe(TOTAL_LAPS);
            expect(data.laps).toHaveLength(TOTAL_LAPS);
        });
    });
});
