/**
 * Pure, framework-independent helpers for the force-based vehicle model.
 *
 * Everything here works in SI units (m, m/s, N, rad, s) and never touches Excalibur, so it can be
 * unit-tested at the bench. The body frame convention is **x = forward, y = lateral**. Conversion
 * to pixels happens only at render time, via {@link pxPerMeter}.
 *
 * The body frame is **x = forward, y = lateral**; the local (art) frame is the nose-up sprite frame
 * where forward is `-y` and lateral is `+x`. `localToBody` bridges the two.
 */

export interface Vec2 {
    x: number;
    y: number;
}

/** Planar rigid-body motion in the body frame: longitudinal/lateral velocity (m/s) and yaw rate (rad/s). */
export interface BodyMotion {
    vx: number;     // forward velocity (m/s)
    vy: number;     // lateral velocity (m/s)
    omega: number;  // yaw rate (rad/s)
}

/**
 * Bridges the nose-up local frame (the sprite/child-actor frame, forward = -y, lateral = +x) to the
 * physics body frame (forward = +x, lateral = +y). Used once to map the drawn wheel/axle geometry
 * onto the body frame for the arms `r_i`, so the spritesheet never has to be rotated.
 */
export function localToBody(v: Vec2): Vec2 {
    return {x: -v.y, y: v.x};
}

/**
 * Pixels-per-meter scale factor, derived from the vehicle length in meters and the sprite height in
 * pixels (the sprite is drawn nose-up, so its height spans the vehicle length).
 */
export function pxPerMeter(lengthMeters: number, spriteHeightPx: number = 121): number {
    return spriteHeightPx / lengthMeters;
}

/**
 * Rotates a vector from the body frame (x = forward, y = lateral) to the world frame, given the body
 * heading angle `theta` (radians). Standard 2D rotation by +theta.
 */
export function bodyToWorld(v: Vec2, theta: number): Vec2 {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    return {
        x: v.x * cos - v.y * sin,
        y: v.x * sin + v.y * cos,
    };
}

/**
 * Rotates a vector from the world frame to the body frame, given the body heading angle `theta`
 * (radians). Inverse of {@link bodyToWorld} (rotation by -theta).
 */
export function worldToBody(v: Vec2, theta: number): Vec2 {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    return {
        x: v.x * cos + v.y * sin,
        y: -v.x * sin + v.y * cos,
    };
}

/**
 * Total mass (kg) used by the physics: chassis mass plus the current fuel mass. Single source of
 * truth so fuel burn (which lowers mass over time) reflects everywhere — static load, rolling
 * resistance, integration. Fuel is inert in Step 0.
 */
export function getTotalMass(mass: number, fuelMass: number): number {
    return mass + fuelMass;
}

/**
 * Integrates one step of the placeholder "tracer" longitudinal dynamics:
 *
 *   a_x  = fx / mass - dragCoeff * vx      (linear drag; `dragCoeff` in 1/s)
 *   vx'  = vx + a_x * dt
 *
 * Returns the new longitudinal velocity (m/s). A non-positive `dt` returns `vx` unchanged.
 */
export function integrateLongitudinalStep(vx: number, fx: number, mass: number, dragCoeff: number, dt: number): number {
    if (dt <= 0) return vx;
    const ax = fx / mass - dragCoeff * vx;
    return vx + ax * dt;
}

/**
 * Integrates one step of the planar rigid-body dynamics in the body frame, with the cross
 * (Coriolis) terms that couple translation and yaw (spec §3.7):
 *
 *   v̇_x = Fx/m + v_y·ω      v̇_y = Fy/m − v_x·ω      ω̇ = Mz/Iz
 *
 * `Fx`/`Fy` are the net forces (N) in the body frame, `Mz` the net yaw torque (N·m). These exact
 * cross terms make the body-frame equations equivalent to F = m·a in the world frame, so a constant
 * world force curves the path correctly as the body rotates. The heading/`θ` update happens outside
 * (by rotating `heading`, see the update system). A non-positive `dt` leaves the state unchanged.
 */
export function integrateBody(state: BodyMotion, fx: number, fy: number, mz: number, mass: number, Iz: number, dt: number): BodyMotion {
    if (dt <= 0) return {...state};
    const ax = fx / mass + state.vy * state.omega;
    const ay = fy / mass - state.vx * state.omega;
    const angAccel = mz / Iz;
    return {
        vx: state.vx + ax * dt,
        vy: state.vy + ay * dt,
        omega: state.omega + angAccel * dt,
    };
}

/** Result of the low-speed blend: how much of the dynamic tyre model to apply, and the kinematic fallback yaw. */
export interface LowSpeedBlend {
    /** Scale in [0, 1] for the dynamic tyre forces: 0 at standstill (fully kinematic), 1 at/above the threshold. */
    lateralScale: number;
    /** Kinematic bicycle yaw rate (rad/s) the model blends toward at low speed. */
    kinematicYaw: number;
}

/**
 * Low-speed kinematic blend (spec §3.10). Below `threshold` the four wheel slip angles are `atan2`
 * of near-zero velocities, i.e. numerical noise, so the dynamic tyre model makes the car vibrate or
 * "launch off on a tangent". This fades it out toward a stable kinematic bicycle model with
 * `k = clamp(speed / threshold, 0, 1)`:
 *   - the caller scales the dynamic tyre forces by `lateralScale` (→ 0 at standstill),
 *   - and blends the yaw rate toward `kinematicYaw = v_x·tan(δ)/L` (reused from {@link kinematicYawRate}).
 * At/above the threshold (`k = 1`) the full dynamic model is returned untouched. A non-positive
 * threshold disables the blend (`lateralScale = 1`). The exact curve (here linear in `k`) is tunable.
 */
export function lowSpeedKinematicBlend(speed: number, threshold: number, vx: number, steerAngle: number, wheelbase: number): LowSpeedBlend {
    const lateralScale = threshold > 0 ? Math.max(0, Math.min(1, speed / threshold)) : 1;
    return {
        lateralScale,
        kinematicYaw: kinematicYawRate(vx, steerAngle, wheelbase),
    };
}

/**
 * Velocity of a single wheel in the body frame, given the body motion `(vx, vy, omega)` and the
 * wheel arm `r_i` (body-frame metres, relative to the COG). A wheel sits at a different point of a
 * rotating body, so it sees a different velocity than the COG (spec §3.6):
 *
 *   v_i_x = v_x − ω·r_i_y      v_i_y = v_y + ω·r_i_x
 *
 * With `omega = 0` every wheel sees the plain body velocity.
 */
export function wheelVelocity(vx: number, vy: number, omega: number, arm: Vec2): Vec2 {
    return {
        x: vx - omega * arm.y,
        y: vy + omega * arm.x,
    };
}

/**
 * Slip angle of a wheel (rad): the angle between where the wheel points and where it actually
 * travels, `α = atan2(v_i_y, v_i_x) − δ`. The steering `δ` is subtracted for the steered (front)
 * wheels; pass `0` for the rear. Zero when the wheel rolls straight along its heading.
 */
export function slipAngle(vix: number, viy: number, delta: number): number {
    return Math.atan2(viy, vix) - delta;
}

/**
 * Linear tyre lateral force (N) in the wheel frame: `Fy = −Cα·α`. Proportional to and **opposing**
 * the slip angle (a wheel slipping one way is pushed back the other), zero at zero slip. No
 * saturation / friction circle yet (Step 2): the force grows unbounded with the slip angle.
 */
export function lateralForceLinear(alpha: number, corneringStiffness: number): number {
    return -corneringStiffness * alpha;
}

/**
 * Kinematic bicycle yaw rate: `ω = v_x·tan(δ)/L` (forward velocity, steering angle, wheelbase).
 * The yaw scales with speed and steering, is zero at standstill or zero steer, and flips sign in
 * reverse (negative `v_x`). Used as the provisional yaw source in Step 1 and reused as the
 * low-speed branch of the blend in a later phase. Returns 0 for a non-positive wheelbase.
 */
export function kinematicYawRate(vx: number, steerAngle: number, wheelbase: number): number {
    if (wheelbase <= 0) return 0;
    return vx * Math.tan(steerAngle) / wheelbase;
}
