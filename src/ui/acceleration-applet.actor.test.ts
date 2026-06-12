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
        weightTransfer = 0;
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
    it('returns zero offset at neutral', () => {
        expect(calcDotOffset(0, 20)).toEqual({x: 0, y: 0});
    });

    it('moves dot up (negative y) at full positive weightTransfer', () => {
        expect(calcDotOffset(1, 20)).toEqual({x: 0, y: -20});
    });

    it('moves dot down (positive y) at full negative weightTransfer', () => {
        expect(calcDotOffset(-1, 20)).toEqual({x: 0, y: 20});
    });

    it('scales proportionally at intermediate values', () => {
        expect(calcDotOffset(0.5, 20)).toEqual({x: 0, y: -10});
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