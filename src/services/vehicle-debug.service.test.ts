import {forceEndpointsLocal, frictionCircleRadiusPx, loadCentroid} from "@/services/vehicle-debug.service";
import {Vec2} from "@/services/vehicle-physics.service";

// Four wheels in the sprite local frame (x = lateral, y = forward axis): front at y=-33, rear at y=35.
const POSITIONS: Vec2[] = [
    {x: -30, y: -33}, // frontLeft
    {x: 30, y: -33},  // frontRight
    {x: -31, y: 35},  // rearLeft
    {x: 31, y: 35},   // rearRight
];

describe('loadCentroid', () => {
    it('equal loads → geometric centroid of the wheels', () => {
        const c = loadCentroid(POSITIONS, [2500, 2500, 2500, 2500]);
        expect(c.x).toBeCloseTo(0, 6);   // symmetric left/right
        expect(c.y).toBeCloseTo(1, 6);   // (-33 -33 +35 +35)/4 = 1
    });

    it('load shifted to the rear → centroid moves rearward (larger y)', () => {
        const rearBiased = loadCentroid(POSITIONS, [1000, 1000, 4000, 4000]);
        const even = loadCentroid(POSITIONS, [2500, 2500, 2500, 2500]);
        expect(rearBiased.y).toBeGreaterThan(even.y);
        expect(rearBiased.x).toBeCloseTo(0, 6); // still left/right symmetric
    });

    it('load shifted to one side → centroid moves toward that side', () => {
        const leftBiased = loadCentroid(POSITIONS, [4000, 1000, 4000, 1000]);
        expect(leftBiased.x).toBeLessThan(0); // toward the left wheels (x<0)
    });

    it('zero total load → falls back to the geometric centroid (no NaN)', () => {
        const c = loadCentroid(POSITIONS, [0, 0, 0, 0]);
        expect(Number.isFinite(c.x)).toBe(true);
        expect(Number.isFinite(c.y)).toBe(true);
        expect(c.x).toBeCloseTo(0, 6);
        expect(c.y).toBeCloseTo(1, 6);
    });
});

describe('frictionCircleRadiusPx', () => {
    it('is μ_eff · Fz · scale', () => {
        expect(frictionCircleRadiusPx(1, 2600, 0.013)).toBeCloseTo(33.8, 6);
    });

    it('scales linearly with load (load transfer grows/shrinks the circle)', () => {
        const low = frictionCircleRadiusPx(1, 2000, 0.013);
        const high = frictionCircleRadiusPx(1, 3500, 0.013);
        expect(high).toBeGreaterThan(low);
        expect(high / low).toBeCloseTo(3500 / 2000, 6);
    });

    it('is zero at zero load or zero grip', () => {
        expect(frictionCircleRadiusPx(1, 0, 0.013)).toBe(0);
        expect(frictionCircleRadiusPx(0, 2600, 0.013)).toBe(0);
    });

    it('never returns a negative radius', () => {
        expect(frictionCircleRadiusPx(-1, 2600, 0.013)).toBe(0);
    });
});

describe('forceEndpointsLocal', () => {
    const SCALE = 0.01;

    it('rear wheel (δ=0): Fx points forward (−y local), Fy points lateral (+x local)', () => {
        const ends = forceEndpointsLocal(2000, 1000, 0, SCALE);
        // Fx>0 (forward) → up in the nose-up local frame (negative y), no lateral component.
        expect(ends.longitudinal.x).toBeCloseTo(0, 6);
        expect(ends.longitudinal.y).toBeCloseTo(-2000 * SCALE, 6);
        // Fy>0 → +x local (right), no longitudinal component.
        expect(ends.lateral.x).toBeCloseTo(1000 * SCALE, 6);
        expect(ends.lateral.y).toBeCloseTo(0, 6);
    });

    it('sign flows through: braking (Fx<0) points backward (+y local)', () => {
        const ends = forceEndpointsLocal(-1500, 0, 0, SCALE);
        expect(ends.longitudinal.y).toBeGreaterThan(0); // backward / down
    });

    it('steered wheel rotates the axes (δ=90° swaps longitudinal onto the lateral local axis)', () => {
        const ends = forceEndpointsLocal(2000, 0, Math.PI / 2, SCALE);
        // forward force on a 90°-steered wheel points along +x local.
        expect(ends.longitudinal.x).toBeCloseTo(2000 * SCALE, 6);
        expect(ends.longitudinal.y).toBeCloseTo(0, 6);
    });

    it('the two components sum to the body→local image of the rotated resultant', () => {
        const fx = 1800;
        const fy = -900;
        const delta = 0.4;
        const ends = forceEndpointsLocal(fx, fy, delta, SCALE);
        const sumX = ends.longitudinal.x + ends.lateral.x;
        const sumY = ends.longitudinal.y + ends.lateral.y;
        // resultant in body frame, rotated by δ, then mapped body→local (local.x=body.y, local.y=-body.x)
        const fbx = fx * Math.cos(delta) - fy * Math.sin(delta);
        const fby = fx * Math.sin(delta) + fy * Math.cos(delta);
        expect(sumX).toBeCloseTo(fby * SCALE, 6);
        expect(sumY).toBeCloseTo(-fbx * SCALE, 6);
    });
});