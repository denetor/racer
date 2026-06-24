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
