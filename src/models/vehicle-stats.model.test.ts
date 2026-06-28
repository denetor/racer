import {VehicleStats} from './vehicle-stats.model';

describe('VehicleStats', () => {
    describe('distanceTraveled', () => {
        it('accumulates |vel|·Δt over multiple frames', () => {
            const s = new VehicleStats();
            s.update(10, 0, 0.1); // 1.0 m
            s.update(20, 0, 0.1); // 2.0 m
            s.update(5, 0, 0.1);  // 0.5 m
            expect(s.distanceTraveled).toBeCloseTo(3.5);
        });

        it('keeps accumulating while braking', () => {
            const s = new VehicleStats();
            s.update(20, 1, 0.1); // open episode, +2.0 m
            s.update(10, 1, 0.1); // +1.0 m
            expect(s.distanceTraveled).toBeCloseTo(3.0);
        });
    });

    describe('braking distance', () => {
        it('saves the stopping distance for a braking episode that reaches a full stop', () => {
            const s = new VehicleStats();
            s.update(20, 1, 0.1); // open (20 > 5, pressed); episode distance 0 so far
            s.update(15, 1, 0.1); // +1.5 m
            s.update(8, 1, 0.1);  // +0.8 m
            s.update(0.2, 1, 0.1); // +0.02 m, then stop (<= 0.5) -> save
            expect(s.lastBrakingDistance).toBeCloseTo(2.32);
        });

        it('discards the episode if the brake is released before stopping', () => {
            const s = new VehicleStats();
            s.update(20, 1, 0.1); // open
            s.update(15, 1, 0.1); // accumulate
            s.update(12, 0, 0.1); // released before the stop -> discard
            expect(s.lastBrakingDistance).toBe(0);
        });

        it('opens no episode when the brake is first pressed below the speed threshold', () => {
            const s = new VehicleStats();
            s.update(3, 1, 0.1);   // 3 < 5: too slow to open
            s.update(2, 1, 0.1);   // still no episode
            s.update(0.2, 1, 0.1); // stops, but nothing was open
            expect(s.lastBrakingDistance).toBe(0);
        });

        it('records multiple episodes in sequence, each overwriting the last', () => {
            const s = new VehicleStats();
            // Episode 1: open at 20, brake to a stop.
            s.update(20, 1, 0.1);
            s.update(10, 1, 0.1);  // +1.0
            s.update(0.2, 1, 0.1); // +0.02, stop -> save 1.02
            expect(s.lastBrakingDistance).toBeCloseTo(1.02);
            // Accelerate again (no brake), then a second, longer braking episode.
            s.update(30, 0, 0.1);
            s.update(30, 1, 0.1);  // open at 30
            s.update(20, 1, 0.1);  // +2.0
            s.update(0.1, 1, 0.1); // +0.01, stop -> save 2.01
            expect(s.lastBrakingDistance).toBeCloseTo(2.01);
        });
    });
});