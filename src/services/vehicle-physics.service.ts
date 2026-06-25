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
