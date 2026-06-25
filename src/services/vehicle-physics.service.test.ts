import {bodyToWorld, getTotalMass, integrateBody, integrateLongitudinalStep, kinematicYawRate, lateralForceLinear, localToBody, pxPerMeter, slipAngle, wheelVelocity, worldToBody} from './vehicle-physics.service';

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

describe('integrateBody', () => {
    const rest = {vx: 0, vy: 0, omega: 0};

    it('accelerates forward under a body Fx', () => {
        // a_x = 2000/1000 = 2 m/s² ; over 1 s from rest -> 2 m/s, no lateral, no yaw
        const next = integrateBody(rest, 2000, 0, 0, 1000, 500, 1);
        expect(next.vx).toBeCloseTo(2);
        expect(next.vy).toBeCloseTo(0);
        expect(next.omega).toBeCloseTo(0);
    });

    it('builds yaw rate under a net torque', () => {
        // ω̇ = 1000/500 = 2 rad/s² ; over 1 s from rest -> 2 rad/s
        const next = integrateBody(rest, 0, 0, 1000, 1000, 500, 1);
        expect(next.omega).toBeCloseTo(2);
    });

    it('couples forward velocity into lateral via the cross term v_x·ω', () => {
        // moving forward and yawing, no force: v̇_y = -v_x·ω = -(10)(0.5) = -5 ; over 0.1 s -> -0.5
        const next = integrateBody({vx: 10, vy: 0, omega: 0.5}, 0, 0, 0, 1000, 500, 0.1);
        expect(next.vy).toBeCloseTo(-0.5);
    });

    it('couples lateral velocity into forward via the cross term v_y·ω', () => {
        // v̇_x = v_y·ω = (4)(0.5) = 2 ; over 0.1 s from vx=10 -> 10.2
        const next = integrateBody({vx: 10, vy: 4, omega: 0.5}, 0, 0, 0, 1000, 500, 0.1);
        expect(next.vx).toBeCloseTo(10.2);
    });

    it('leaves the state unchanged for a non-positive dt', () => {
        const state = {vx: 3, vy: -1, omega: 0.7};
        expect(integrateBody(state, 9999, 9999, 9999, 1000, 500, 0)).toEqual(state);
    });
});

describe('wheelVelocity', () => {
    it('equals the body velocity when the body is not yawing', () => {
        const v = wheelVelocity(10, 2, 0, {x: 1.5, y: 0.8});
        expect(v.x).toBeCloseTo(10);
        expect(v.y).toBeCloseTo(2);
    });

    it('adds the yaw contribution from the arm: v_x = v_x − ω·r_y, v_y = v_y + ω·r_x', () => {
        // ω = 2, arm = (1.5, 0.8): v_x = 10 − 2·0.8 = 8.4 ; v_y = 0 + 2·1.5 = 3
        const v = wheelVelocity(10, 0, 2, {x: 1.5, y: 0.8});
        expect(v.x).toBeCloseTo(8.4);
        expect(v.y).toBeCloseTo(3);
    });
});

describe('slipAngle', () => {
    it('is the velocity direction when the wheel is not steered', () => {
        // atan2(1, 1) = 45deg, no steering subtracted
        expect(slipAngle(1, 1, 0)).toBeCloseTo(Math.PI / 4);
    });

    it('subtracts the steering angle of a steered wheel', () => {
        // pure forward velocity (atan2 = 0) minus δ = -δ
        expect(slipAngle(1, 0, 0.3)).toBeCloseTo(-0.3);
    });

    it('is zero when the wheel rolls straight along its heading', () => {
        expect(slipAngle(10, 0, 0)).toBeCloseTo(0);
    });
});

describe('lateralForceLinear', () => {
    it('opposes the slip angle (restoring force)', () => {
        expect(lateralForceLinear(0.1, 50000)).toBeCloseTo(-5000);
        expect(lateralForceLinear(-0.1, 50000)).toBeCloseTo(5000);
    });

    it('is proportional to the cornering stiffness', () => {
        expect(lateralForceLinear(0.1, 100000)).toBeCloseTo(2 * lateralForceLinear(0.1, 50000));
    });

    it('is zero at zero slip', () => {
        expect(lateralForceLinear(0, 50000)).toBeCloseTo(0);
    });
});

describe('kinematicYawRate', () => {
    it('is zero at zero steering angle', () => {
        expect(kinematicYawRate(10, 0, 2.5)).toBeCloseTo(0);
    });

    it('is zero at standstill regardless of steering', () => {
        expect(kinematicYawRate(0, 0.4, 2.5)).toBeCloseTo(0);
    });

    it('scales with forward speed and steering: ω = v·tan(δ)/L', () => {
        expect(kinematicYawRate(10, 0.4, 2.5)).toBeCloseTo(10 * Math.tan(0.4) / 2.5);
    });

    it('flips sign in reverse (negative forward velocity)', () => {
        const fwd = kinematicYawRate(10, 0.4, 2.5);
        const rev = kinematicYawRate(-10, 0.4, 2.5);
        expect(rev).toBeCloseTo(-fwd);
    });

    it('returns zero for a non-positive wheelbase', () => {
        expect(kinematicYawRate(10, 0.4, 0)).toBe(0);
    });
});
