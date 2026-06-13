import {computeGripFactors, computeLongitudinalAcceleration, moveToward, smoothPedal, sumClamp} from './math.service';

describe('sumClamp', () => {
    it('clamps the sum to min', () => {
        expect(sumClamp(0, -5, -3, 10)).toBe(-3);
    });

    it('clamps the sum to max', () => {
        expect(sumClamp(8, 5, 0, 10)).toBe(10);
    });

    it('returns the unclamped sum when within bounds', () => {
        expect(sumClamp(3, 2, 0, 10)).toBe(5);
    });
});

describe('smoothPedal', () => {
    it('advances toward 1 at pressRate when pressing', () => {
        // throttlePressRate = 2.0/s, dt = 0.1s → delta = 0.2
        expect(smoothPedal(0, true, 2.0, 4.0, 0.1)).toBeCloseTo(0.2);
    });

    it('clamps to 1 when pressing would overshoot', () => {
        expect(smoothPedal(0.95, true, 2.0, 4.0, 0.1)).toBe(1);
    });

    it('retreats toward 0 at releaseRate when not pressing', () => {
        // throttleReleaseRate = 4.0/s, dt = 0.1s → delta = 0.4
        expect(smoothPedal(1, false, 2.0, 4.0, 0.1)).toBeCloseTo(0.6);
    });

    it('clamps to 0 when releasing would undershoot', () => {
        expect(smoothPedal(0.1, false, 2.0, 4.0, 0.1)).toBe(0);
    });

    it('uses pressRate and releaseRate independently', () => {
        const afterPress   = smoothPedal(0,   true,  3.0, 6.0, 0.1);
        const afterRelease = smoothPedal(1.0, false, 3.0, 6.0, 0.1);
        expect(afterPress).toBeCloseTo(0.3);
        expect(afterRelease).toBeCloseTo(0.4);
    });
});

describe('moveToward', () => {
    it('advances toward positive target by maxDelta', () => {
        // weightTransferRate=3.0, dt=0.1s → step=0.3
        expect(moveToward(0, 1, 0.3)).toBeCloseTo(0.3);
    });

    it('snaps to target when remaining distance is within maxDelta', () => {
        expect(moveToward(0.8, 1, 0.3)).toBe(1);
    });

    it('advances toward negative target correctly', () => {
        expect(moveToward(0, -1, 0.3)).toBeCloseTo(-0.3);
    });

    it('returns current value unchanged when maxDelta is zero', () => {
        expect(moveToward(0.5, 1, 0)).toBe(0.5);
    });
});

describe('computeGripFactors', () => {
    it('returns neutral grip when weightTransfer is zero', () => {
        const { frontGrip, rearGrip } = computeGripFactors(0, 1.0, 0.4, 1.5);
        expect(frontGrip).toBe(1.0);
        expect(rearGrip).toBe(1.0);
    });

    it('reduces frontGrip and keeps rearGrip at 1 under full throttle (weight rearward)', () => {
        const { frontGrip, rearGrip } = computeGripFactors(1.0, 1.0, 0.4, 1.5);
        expect(frontGrip).toBeCloseTo(0.6);
        expect(rearGrip).toBe(1.0); // 1 + 0.4 = 1.4 → clamped to 1
    });

    it('raises frontGrip above 1 and reduces rearGrip under full braking (weight forward)', () => {
        const { frontGrip, rearGrip } = computeGripFactors(-1.0, 1.0, 0.4, 1.5);
        expect(frontGrip).toBeCloseTo(1.4);
        expect(rearGrip).toBeCloseTo(0.6);
    });

    it('clamps frontGrip to frontGripCap when braking would exceed it', () => {
        // 1 - (-1.0 * 0.6) = 1.6 → clamped to 1.5
        const { frontGrip } = computeGripFactors(-1.0, 1.0, 0.6, 1.5);
        expect(frontGrip).toBe(1.5);
    });

    it('returns neutral grip at max speed (speedDampening = 0)', () => {
        const { frontGrip, rearGrip } = computeGripFactors(-1.0, 0, 0.4, 1.5);
        expect(frontGrip).toBe(1.0);
        expect(rearGrip).toBe(1.0);
    });

    it('scales effect proportionally with speedDampening', () => {
        const { frontGrip, rearGrip } = computeGripFactors(-1.0, 0.5, 0.4, 1.5);
        expect(frontGrip).toBeCloseTo(1.2); // 1 - (-0.5 * 0.4) = 1.2
        expect(rearGrip).toBeCloseTo(0.8);  // 1 + (-0.5 * 0.4) = 0.8
    });
});

describe('computeLongitudinalAcceleration', () => {
    it('returns positive acceleration when speeding up forward', () => {
        // (110 - 100) / 0.1 = 100
        expect(computeLongitudinalAcceleration(110, 100, false, 0.1)).toBeCloseTo(100);
    });

    it('returns negative acceleration when decelerating forward', () => {
        // (90 - 100) / 0.1 = -100
        expect(computeLongitudinalAcceleration(90, 100, false, 0.1)).toBeCloseTo(-100);
    });

    it('returns zero at steady speed', () => {
        expect(computeLongitudinalAcceleration(100, 100, false, 0.1)).toBe(0);
    });

    it('returns negative acceleration when gaining speed in reverse', () => {
        // signedNow=-110, signedPrev=-100 → (-110 - -100)/0.1 = -100
        expect(computeLongitudinalAcceleration(110, 100, true, 0.1)).toBeCloseTo(-100);
    });

    it('returns positive acceleration when lifting off in reverse', () => {
        // signedNow=-90, signedPrev=-100 → (-90 - -100)/0.1 = 100
        expect(computeLongitudinalAcceleration(90, 100, true, 0.1)).toBeCloseTo(100);
    });

    it('returns 0 when dt is zero (forward)', () => {
        expect(computeLongitudinalAcceleration(110, 100, false, 0)).toBe(0);
    });

    it('returns 0 when dt is zero (reverse)', () => {
        expect(computeLongitudinalAcceleration(110, 100, true, 0)).toBe(0);
    });

    it('returns 0 when dt is negative', () => {
        expect(computeLongitudinalAcceleration(110, 100, false, -0.1)).toBe(0);
    });

    it('is frame-rate independent: same delta over a larger dt yields a smaller result', () => {
        // same Δspeed of 10, dt doubled → result halved
        expect(computeLongitudinalAcceleration(110, 100, false, 0.2)).toBeCloseTo(50);
    });
});
