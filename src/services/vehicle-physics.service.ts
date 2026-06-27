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

/** Body-frame (forward = +x, lateral = +y) arm of each wheel relative to the centre of gravity, in metres. */
export interface WheelArms {
    frontLeftWheel: Vec2;
    frontRightWheel: Vec2;
    rearLeftWheel: Vec2;
    rearRightWheel: Vec2;
}

/** Per-wheel quantity keyed by the four wheel names (e.g. static load Fz in N). */
export interface WheelLoads {
    frontLeftWheel: number;
    frontRightWheel: number;
    rearLeftWheel: number;
    rearRightWheel: number;
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
 * Static load Fz (N) on each of the four wheels (spec §3.3). Splits the total weight `totalMass·g`
 * **longitudinally** (front axle gets `b/L`, rear gets `a/L`, with `a`/`b` the COG→axle distances and
 * `L = a + b` the wheelbase) and then **laterally** within each axle (from the wheels' lateral
 * offsets, so a side-decentred COG loads its side more).
 *
 * The geometry comes entirely from the wheel `arms` (body-frame metres, already relative to the COG),
 * so a COG decentred both longitudinally and laterally is supported for free. `cogHeight` does **not**
 * enter: this is the *static* split — load transfer under acceleration/cornering is a later step. With
 * a centred COG the result is four equal quarters (`totalMass·g/4`); the four Fz always sum to
 * `totalMass·g`. Each Fz is clamped to `≥ 0` (trivial without load transfer).
 */
export function staticLoad(totalMass: number, g: number, arms: WheelArms): WheelLoads {
    const weight = totalMass * g;
    // Longitudinal split: a = COG->front axle (>0), b = COG->rear axle (>0); front carries b/L.
    const a = arms.frontLeftWheel.x;
    const b = -arms.rearLeftWheel.x;
    const L = a + b;
    const frontAxle = L > 0 ? weight * (b / L) : weight / 2;
    const rearAxle = L > 0 ? weight * (a / L) : weight / 2;
    // Lateral split per axle: a wheel's load fraction is the COG's distance to the *opposite* wheel
    // over the track (right arm.y > 0, left arm.y < 0).
    const split = (axleLoad: number, leftArm: Vec2, rightArm: Vec2): {left: number; right: number} => {
        const track = rightArm.y - leftArm.y;
        if (track <= 0) return {left: axleLoad / 2, right: axleLoad / 2};
        return {
            left: Math.max(0, axleLoad * (rightArm.y / track)),
            right: Math.max(0, axleLoad * (-leftArm.y / track)),
        };
    };
    const front = split(frontAxle, arms.frontLeftWheel, arms.frontRightWheel);
    const rear = split(rearAxle, arms.rearLeftWheel, arms.rearRightWheel);
    return {
        frontLeftWheel: front.left,
        frontRightWheel: front.right,
        rearLeftWheel: rear.left,
        rearRightWheel: rear.right,
    };
}

/**
 * Longitudinal load transfer (spec §3.4): the **axle-total** vertical load (N) that shifts from the
 * front axle to the rear axle under longitudinal acceleration. `ΔFz = mass · a_x · cogHeight / L`,
 * with `a_x` the body-frame longitudinal acceleration (m/s²), `cogHeight` the COG height above ground
 * (m), and `L` the wheelbase (m).
 *
 * Sign: `a_x > 0` (accelerating) returns a **positive** ΔFz = load moving rearward (the rear axle
 * gains, the front lightens); braking (`a_x < 0`) returns negative = load moving forward ("dive").
 * This is the **axle** transfer, so each of the axle's two wheels gets half. Returns 0 for a
 * non-positive wheelbase. The COG itself does not move — only the load (spec §3.4).
 */
export function longitudinalLoadTransfer(mass: number, ax: number, cogHeight: number, L: number): number {
    if (L <= 0) return 0;
    return mass * ax * cogHeight / L;
}

/**
 * Lateral load transfer (spec §3.4): the **per-wheel** vertical load (N) that shifts from the inner to
 * the outer wheels of an axle under lateral acceleration. `ΔFz = massAxle · a_y · cogHeight / track`,
 * with `massAxle` the mass carried by that axle (kg), `a_y` the body-frame lateral acceleration
 * (m/s²), `cogHeight` the COG height (m) and `track` that axle's track width (m).
 *
 * Computed **per axle** (each axle uses its own track and its static mass share), so no roll-stiffness
 * knob is needed. Unlike the longitudinal transfer this magnitude is **already per wheel**: one side
 * gains `ΔFz`, the other loses it (the side is resolved by the caller from the sign of `a_y`). Returns
 * 0 for a non-positive track. The COG itself does not move — only the load (spec §3.4).
 */
export function lateralLoadTransfer(massAxle: number, ay: number, cogHeight: number, track: number): number {
    if (track <= 0) return 0;
    return massAxle * ay * cogHeight / track;
}

/**
 * Dynamic per-wheel vertical load Fz (N): the static split (spec §3.3) plus load transfer (spec §3.4),
 * each wheel clamped to `≥ 0`. The centre of gravity stays **fixed** in the body; only the *load*
 * redistributes between the tyres under acceleration. This is the sole entry point used by the update
 * system, and its output feeds the friction circle (`μ·Fz`).
 *
 * **Longitudinal.** The axle-total transfer {@link longitudinalLoadTransfer} is split half per wheel
 * and signed by axle: under forward acceleration (`a_x > 0`) the front wheels lose `ΔL/2` and the rear
 * wheels gain `ΔL/2` (so braking loads the front — "dive").
 *
 * **Lateral.** Computed **per axle** ({@link lateralLoadTransfer}), each axle using its own track and
 * its static mass share. `a_y > 0` (toward +y/right) puts the turn centre to the right, so the outside
 * is the **left**: the left wheels gain `ΔFz`, the right wheels lose it.
 *
 * Both sets of signed transfers sum to zero, so **before the clamp** the loads still sum to the total
 * weight (conservation). Each wheel is then clamped to `≥ 0` (an unloaded wheel has zero grip). The
 * clamped excess is **not** redistributed (spec §3.4), so the sum may drop below the total weight when
 * a wheel lifts.
 */
export function dynamicLoad(staticLoads: WheelLoads, mass: number, ax: number, ay: number, cogHeight: number, L: number, trackFront: number, trackRear: number): WheelLoads {
    // Longitudinal: axle-total transfer, half to each wheel; front loses, rear gains under +a_x.
    const halfLong = longitudinalLoadTransfer(mass, ax, cogHeight, L) / 2;
    // Lateral: per axle, from the axle's own track and static mass share. ay>0 (toward +y/right) puts
    // the turn centre to the right, so the outside is the left -> left wheels gain, right wheels lose.
    const totalStatic = staticLoads.frontLeftWheel + staticLoads.frontRightWheel + staticLoads.rearLeftWheel + staticLoads.rearRightWheel;
    const massFront = totalStatic > 0 ? mass * (staticLoads.frontLeftWheel + staticLoads.frontRightWheel) / totalStatic : mass / 2;
    const massRear = totalStatic > 0 ? mass * (staticLoads.rearLeftWheel + staticLoads.rearRightWheel) / totalStatic : mass / 2;
    const latFront = lateralLoadTransfer(massFront, ay, cogHeight, trackFront);
    const latRear = lateralLoadTransfer(massRear, ay, cogHeight, trackRear);
    return {
        frontLeftWheel: Math.max(0, staticLoads.frontLeftWheel - halfLong + latFront),
        frontRightWheel: Math.max(0, staticLoads.frontRightWheel - halfLong - latFront),
        rearLeftWheel: Math.max(0, staticLoads.rearLeftWheel + halfLong + latRear),
        rearRightWheel: Math.max(0, staticLoads.rearRightWheel + halfLong - latRear),
    };
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

/** A tyre force after the friction-circle clamp, plus whether the demanded force exceeded the circle. */
export interface ClampedForce {
    fx: number;         // longitudinal force after the clamp (N), body/wheel frame
    fy: number;         // lateral force after the clamp (N)
    saturated: boolean; // true when the demanded force exceeded the circle radius (the tyre is sliding)
}

/**
 * Friction circle (spec §3.5): a tyre can produce at most a force of magnitude `μ·Fz`. If the
 * demanded force `(fx, fy)` is inside the circle it passes through unchanged; if it exceeds the
 * radius it is scaled down to the radius **keeping its direction**, and `saturated` is raised (the
 * tyre slides). Written in the general combined `fx`/`fy` form for reuse at Step 4; at Step 2 it is
 * called with `fx = 0` per wheel, i.e. it just clamps `|fy| ≤ μ·Fz`.
 *
 * Edge cases: `Fz = 0` (or `μ = 0`) gives a zero radius, so any non-zero demand collapses to zero
 * force and saturates; a zero demand stays zero and is not saturated.
 */
export function clampToFrictionCircle(fx: number, fy: number, mu: number, fz: number): ClampedForce {
    const maxForce = Math.max(0, mu * fz);
    const magnitude = Math.hypot(fx, fy);
    if (magnitude <= maxForce || magnitude === 0) {
        return {fx, fy, saturated: false};
    }
    const scale = maxForce / magnitude;
    return {fx: fx * scale, fy: fy * scale, saturated: true};
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

/** Driven axle layout: front-, rear- or all-wheel drive. */
export type Drivetrain = 'fwd' | 'rwd' | 'awd';

/**
 * Power-limited engine drive force (N), spec §3.8: `F_drive = min(F_max, P / v)`. Strong from rest
 * (capped at `F_max`) and fading as `P/v` once the power ceiling bites, so the top speed emerges as a
 * plateau from the balance with the resistances instead of a hard cap. `v` is the forward body speed
 * `|v_x|` (m/s); the caller floors it at `V_FLOOR` to keep `P/v` smooth near standstill. A
 * non-positive `v` returns `F_max` (defensive: no division by zero). The sign (gear) and the throttle
 * scaling are applied by the caller.
 */
export function driveForce(power: number, fMax: number, v: number): number {
    if (v <= 0) return fMax;
    return Math.min(fMax, power / v);
}

/**
 * Aerodynamic drag magnitude (N), spec §3.8: `½·ρ·Cd·A·v²`. Grows with the square of the speed, so it
 * is what makes the top speed settle (the plateau is where `P/v = F_aero + F_roll`). Returns the
 * magnitude only; the caller applies it as a body force at the COG opposing `v_x` (no yaw torque).
 */
export function aeroDrag(rho: number, cd: number, a: number, v: number): number {
    return 0.5 * rho * cd * a * v * v;
}

/**
 * Rolling-resistance magnitude (N) for a single wheel, spec §3.8: `Crr · rollFactor · Fz`. `Crr` is
 * the generic tyre coefficient, `rollFactor` the per-surface multiplier under that wheel (high on
 * grass), and `Fz` the wheel's dynamic vertical load. Returns the magnitude only; the caller applies
 * it opposing that wheel's longitudinal velocity `v_i_x`. Because it is per wheel, an asymmetric
 * surface (half the car on grass) makes the wheels drag unevenly, yawing the car ("pull"); on a
 * uniform surface the four sum to `≈ Crr·m·g`, the net form of the spec. Zero at zero load.
 */
export function rollingResistance(crr: number, rollFactor: number, fz: number): number {
    return crr * rollFactor * fz;
}

/**
 * Distributes the (signed) total drive force `fDrive` (N) onto the four wheels by drivetrain
 * (spec §3.9), returning the per-wheel longitudinal share as a {@link WheelLoads}:
 *   - `fwd` → all to the front axle, `rwd` → all to the rear axle;
 *   - `awd` → `driveBias·fDrive` to the front and `(1−driveBias)·fDrive` to the rear (`driveBias` is
 *     the front fraction).
 * Within each axle the share is split **50/50** between the two wheels — an open-differential
 * stand-in; real differentials are deferred. `fwd`/`rwd` ignore `driveBias`. The four shares always
 * sum to `fDrive`. The sign of `fDrive` (forward/reverse) flows through unchanged.
 */
export function distributeDrive(fDrive: number, drivetrain: Drivetrain, driveBias: number): WheelLoads {
    let front = 0;
    let rear = 0;
    switch (drivetrain) {
        case 'fwd': front = fDrive; break;
        case 'rwd': rear = fDrive; break;
        case 'awd': front = fDrive * driveBias; rear = fDrive * (1 - driveBias); break;
    }
    return {
        frontLeftWheel: front / 2,
        frontRightWheel: front / 2,
        rearLeftWheel: rear / 2,
        rearRightWheel: rear / 2,
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
