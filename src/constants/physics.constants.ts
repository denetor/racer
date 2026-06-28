/**
 * Generic, vehicle-independent physics constants. Per-vehicle parameters (mass, geometry, Cα, ...)
 * live on the vehicle actor instead; this file keeps the shared magic numbers out of the systems.
 *
 * Some constants are declared here ahead of the step that consumes them (aerodynamics, low-speed
 * kinematic blend), so the single source of truth exists from the start.
 */

/** Air density at sea level (kg/m³); used by aerodynamic drag F_aero = ½·ρ·Cd·A·v² (later step). */
export const RHO_AIR = 1.225;

/** Gravitational acceleration (m/s²); used by static load and rolling resistance (later step). */
export const G = 9.81;

/**
 * Grip coefficient μ for a wheel that is not on any surface (off-map / between surface polygons).
 * The per-surface grip is `SurfaceActor.gripFactor` directly (tarmac 1.0 / grass 0.5 / gravel 1.3);
 * this is the shared fallback so no magic number leaks into the systems.
 */
export const DEFAULT_SURFACE_GRIP = 1.0;

/**
 * Speed (m/s) below which the tyre slip angles become numerical noise (atan2 of near-zero
 * velocities). Under this threshold the model blends toward the kinematic one. Declared now, used
 * by the low-speed blend in Step 1.
 */
export const LOW_SPEED_BLEND_THRESHOLD = 5;

/**
 * Rolling-resistance coefficient Crr (dimensionless): the rolling drag is `Crr · rollFactor · Fz`
 * per wheel (spec §3.8). It is a tyre/surface property, not a per-vehicle one, so it lives here; the
 * per-surface multiplier (`rollFactor`) scales it under each wheel. Declared now, consumed by the
 * per-wheel rolling resistance in Step 4 Phase 2.
 */
export const CRR = 0.015;

/**
 * Floor speed (m/s) for the power-limited engine `F_drive = min(F_max, P / max(|v_x|, V_FLOOR))`
 * (spec §3.8). Keeps `P/v` finite near standstill so the drive force is `F_max` from rest instead of
 * a division by zero. Used by Step 4.
 */
export const V_FLOOR = 1;

/**
 * Speed (m/s) below which the skid flags (`wheelspin`/`lockup`) are suppressed (spec §3.5, Step 5).
 * Near standstill the tyre is not really sliding, so the flags — and the smoke they drive — would
 * flicker. Kept small so that on low grip the wheelspin still shows right after launch. Applied by
 * the update system to both flags.
 */
export const SKID_MIN_SPEED = 0.5;

/**
 * Floor of the per-wheel tyre wear (spec §4 "Usura gomme"): `wear` degrades the grip via
 * `μ_eff = gripSurface · wear` and is clamped to `wear = max(MIN_TYRE_WEAR, wear − delta)`. A worn
 * tyre has reduced but **non-zero** residual grip, so the car stays drivable even over a long stint
 * (otherwise `wear → 0` would null the friction circle and make it ungovernable). Shared physical
 * limit; the per-vehicle wear *rate* (compound) lives on the vehicle actor instead.
 */
export const MIN_TYRE_WEAR = 0.55;