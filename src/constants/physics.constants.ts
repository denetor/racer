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