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
        throttleInput = 0;
        brakeInput = 0;
    },
}));

jest.mock('@/ui/driving-dashboard.actor', () => ({
    DrivingDashboardActor: {HEIGHT: 64},
}));

import {
    calcBarHeight,
    PEDALS_MARGIN,
    PEDALS_BAR_WIDTH,
    PEDALS_GAP,
    PedalsAppletActor,
} from './pedals-applet.actor';

const APPLET_SIZE = 64 - PEDALS_MARGIN * 2;

describe('layout constants', () => {
    it('applet size is dashboard height minus margins on both sides', () => {
        expect(APPLET_SIZE).toBe(48);
    });

    it('two bars and gap fill the full applet width', () => {
        expect(PEDALS_BAR_WIDTH + PEDALS_GAP + PEDALS_BAR_WIDTH).toBe(APPLET_SIZE);
    });
});

describe('calcBarHeight', () => {
    it('returns 0 when pedal is not pressed', () => {
        expect(calcBarHeight(0, APPLET_SIZE)).toBe(0);
    });

    it('returns half applet size at half pressure', () => {
        expect(calcBarHeight(0.5, APPLET_SIZE)).toBe(24);
    });

    it('returns full applet size at full pressure', () => {
        expect(calcBarHeight(1, APPLET_SIZE)).toBe(APPLET_SIZE);
    });
});

describe('PedalsAppletActor', () => {
    it('is sized as dashboard height minus margins', () => {
        const applet = new PedalsAppletActor();
        expect(applet.width).toBe(APPLET_SIZE);
        expect(applet.height).toBe(APPLET_SIZE);
    });

    it('setVehicle does not throw', () => {
        const {VehicleActor} = jest.requireMock('@/actors/vehicle.actor');
        const applet = new PedalsAppletActor();
        expect(() => applet.setVehicle(new VehicleActor())).not.toThrow();
    });
});