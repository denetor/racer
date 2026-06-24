import {bodyToWorld, getTotalMass, integrateLongitudinalStep, localToBody, pxPerMeter, worldToBody} from './vehicle-physics.service';

describe('pxPerMeter', () => {
    it('derives the scale from the sprite height and vehicle length', () => {
        expect(pxPerMeter(4.5)).toBeCloseTo(121 / 4.5);
    });

    it('uses the provided sprite height', () => {
        expect(pxPerMeter(2, 100)).toBe(50);
    });
});

describe('bodyToWorld', () => {
    it('is the identity at theta = 0', () => {
        const w = bodyToWorld({x: 3, y: 2}, 0);
        expect(w.x).toBeCloseTo(3);
        expect(w.y).toBeCloseTo(2);
    });

    it('rotates a forward vector by 90 degrees', () => {
        const w = bodyToWorld({x: 1, y: 0}, Math.PI / 2);
        expect(w.x).toBeCloseTo(0);
        expect(w.y).toBeCloseTo(1);
    });

    it('maps body-forward onto the world heading direction', () => {
        const w = bodyToWorld({x: 2, y: 0}, Math.PI); // heading points along -x
        expect(w.x).toBeCloseTo(-2);
        expect(w.y).toBeCloseTo(0);
    });
});

describe('localToBody', () => {
    it('maps nose-up local forward (-y) onto body forward (+x)', () => {
        const b = localToBody({x: 0, y: -1}); // local forward
        expect(b.x).toBeCloseTo(1);
        expect(b.y).toBeCloseTo(0);
    });

    it('maps local lateral (+x) onto body lateral (+y)', () => {
        const b = localToBody({x: 1, y: 0});
        expect(b.x).toBeCloseTo(0);
        expect(b.y).toBeCloseTo(1);
    });
});

describe('worldToBody', () => {
    it('is the identity at theta = 0', () => {
        const b = worldToBody({x: 3, y: 2}, 0);
        expect(b.x).toBeCloseTo(3);
        expect(b.y).toBeCloseTo(2);
    });

    it('inverts a known rotation', () => {
        // world vector pointing +y, body heading +90deg -> body-forward (+x)
        const b = worldToBody({x: 0, y: 1}, Math.PI / 2);
        expect(b.x).toBeCloseTo(1);
        expect(b.y).toBeCloseTo(0);
    });

    it('round-trips with bodyToWorld for an arbitrary theta', () => {
        const v = {x: 1.5, y: -0.7};
        const theta = 0.9;
        const back = worldToBody(bodyToWorld(v, theta), theta);
        expect(back.x).toBeCloseTo(v.x);
        expect(back.y).toBeCloseTo(v.y);
    });
});

describe('getTotalMass', () => {
    it('sums chassis mass and fuel mass', () => {
        expect(getTotalMass(1000, 60)).toBe(1060);
    });

    it('equals the chassis mass with an empty tank', () => {
        expect(getTotalMass(1000, 0)).toBe(1000);
    });
});

describe('integrateLongitudinalStep', () => {
    it('accelerates under a positive drive force', () => {
        // a = 1000/1000 - 0 = 1 m/s² ; over 1 s from rest -> 1 m/s
        expect(integrateLongitudinalStep(0, 1000, 1000, 0, 1)).toBeCloseTo(1);
    });

    it('decelerates from linear drag while coasting', () => {
        // a = 0 - 0.2*10 = -2 m/s² ; over 1 s from 10 -> 8 m/s
        expect(integrateLongitudinalStep(10, 0, 1000, 0.2, 1)).toBeCloseTo(8);
    });

    it('returns the velocity unchanged for a non-positive dt', () => {
        expect(integrateLongitudinalStep(7, 5000, 1000, 0.2, 0)).toBe(7);
    });
});
