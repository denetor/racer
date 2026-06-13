jest.mock('excalibur', () => ({
    ScreenElement: class {
        constructor(public readonly opts: Record<string, unknown> = {}) {}
        graphics = {use: jest.fn()};
        addChild = jest.fn();
        get width() { return this.opts['width'] as number ?? 0; }
        get height() { return this.opts['height'] as number ?? 0; }
    },
    Canvas: jest.fn(),
    vec: (x: number, y: number) => ({x, y}),
}));

jest.mock('@/actors/vehicle.actor', () => ({
    VehicleActor: class {
        acceleration = {x: 0, y: 0};
        accelerationFullScale = 800;
    },
}));

jest.mock('@/ui/driving-dashboard.actor', () => ({
    DrivingDashboardActor: {HEIGHT: 64},
}));

jest.mock('@/ui/pedals-applet.actor', () => ({
    PEDALS_MARGIN: 8,
}));

import {calcDotOffset, AccelerationAppletActor} from './acceleration-applet.actor';

const APPLET_SIZE = 64 - 8 * 2;

describe('calcDotOffset', () => {
    // full-scale acceleration of 800 px/s² is passed explicitly

    it('returns zero offset at zero acceleration', () => {
        expect(calcDotOffset({x: 0, y: 0}, 20, 800)).toEqual({x: 0, y: 0});
    });

    it('moves dot up (negative y) when speeding up at full-scale', () => {
        expect(calcDotOffset({x: 0, y: 800}, 20, 800)).toEqual({x: 0, y: -20});
    });

    it('moves dot down (positive y) when braking at full-scale', () => {
        expect(calcDotOffset({x: 0, y: -800}, 20, 800)).toEqual({x: 0, y: 20});
    });

    it('moves dot right at positive lateral acceleration', () => {
        expect(calcDotOffset({x: 800, y: 0}, 20, 800)).toEqual({x: 20, y: 0});
    });

    it('scales proportionally at intermediate values', () => {
        expect(calcDotOffset({x: 0, y: 400}, 20, 800)).toEqual({x: 0, y: -10});
    });

    it('clamps over-range longitudinal acceleration to the radius', () => {
        expect(calcDotOffset({x: 0, y: 1600}, 20, 800)).toEqual({x: 0, y: -20});
    });

    it('clamps combined over-range to the boundary circle (magnitude = radius)', () => {
        const offset = calcDotOffset({x: 800, y: 800}, 20, 800);
        expect(Math.hypot(offset.x, offset.y)).toBeCloseTo(20);
        expect(offset.x).toBeCloseTo(20 / Math.SQRT2);
        expect(offset.y).toBeCloseTo(-20 / Math.SQRT2);
    });
});

describe('AccelerationAppletActor', () => {
    it('is sized as dashboard height minus margins', () => {
        const applet = new AccelerationAppletActor();
        expect(applet.width).toBe(APPLET_SIZE);
        expect(applet.height).toBe(APPLET_SIZE);
    });

    it('setVehicle does not throw', () => {
        const {VehicleActor} = jest.requireMock('@/actors/vehicle.actor');
        const applet = new AccelerationAppletActor();
        expect(() => applet.setVehicle(new VehicleActor())).not.toThrow();
    });
});