/**
 * Pure, framework-independent helpers for the on-vehicle physics debug overlay. Like
 * {@link vehicle-physics.service}, nothing here touches Excalibur, so it is unit-tested at the bench.
 * These compute the geometry the overlay draws (load centroid, friction-circle radius, force endpoints)
 * from already-computed SI state; the actor stays a thin view on top.
 */

import {Vec2} from "@/services/vehicle-physics.service";

/**
 * Load centroid: the position where the resultant of the vertical wheel loads acts, i.e. the weighted
 * average of the wheel positions by their `Fz` — `Σ(pos_i·load_i) / Σload_i`. Fed the **static** loads it
 * returns the static centre of gravity; fed the **dynamic** loads it returns where the load has shifted
 * under weight transfer. Frame-agnostic (works in whatever frame `positions` are given).
 *
 * Degenerate case: when the total load is non-positive (e.g. before the physics has written any load)
 * it falls back to the plain geometric centroid of the positions, so the result is always finite.
 * `positions` and `loads` are paired by index and assumed the same length.
 */
export function loadCentroid(positions: Vec2[], loads: number[]): Vec2 {
    let sx = 0;
    let sy = 0;
    let total = 0;
    for (let i = 0; i < positions.length; i++) {
        sx += positions[i].x * loads[i];
        sy += positions[i].y * loads[i];
        total += loads[i];
    }
    if (total > 0) {
        return {x: sx / total, y: sy / total};
    }
    // Degenerate (no load): geometric centroid of the positions.
    const n = positions.length || 1;
    let gx = 0;
    let gy = 0;
    for (const p of positions) {
        gx += p.x;
        gy += p.y;
    }
    return {x: gx / n, y: gy / n};
}

/**
 * Radius (px) of a wheel's friction circle: `μ_eff · Fz · scale`, clamped to `≥ 0`. `μ_eff` is the
 * effective grip (`gripSurface · wear`), `Fz` the dynamic vertical load (N) and `scale` the shared
 * Newton→pixel factor, so the same `scale` makes a force vector reach the circle edge exactly at
 * saturation. Zero load or zero grip → zero radius (the tyre has no grip to draw).
 */
export function frictionCircleRadiusPx(muEff: number, fz: number, scale: number): number {
    return Math.max(0, muEff * fz * scale);
}

/** Endpoints (relative to the wheel centre, local sprite px) of a wheel's two force-component lines. */
export interface ForceEndpoints {
    longitudinal: Vec2; // tip of the Fx component, along the wheel rolling axis
    lateral: Vec2;      // tip of the Fy component, along the wheel lateral axis
}

/**
 * Endpoints of the two force-component lines for one wheel, in the **local sprite frame** (px), relative
 * to the wheel centre. `fx`/`fy` are the wheel-frame longitudinal/lateral forces (N); `delta` is the
 * steering angle (0 for the rear), so the axes — and the lines — rotate with a steered wheel; `scale`
 * is the shared Newton→pixel factor.
 *
 * Frame chain: the wheel axes in the body frame are `forward·δ = (cosδ, sinδ)` and `lateral·δ =
 * (−sinδ, cosδ)`; body→local maps `(bx, by) → (by, −bx)`. The two endpoints sum to the body→local image
 * of the resultant `(fx, fy)` rotated by δ, so when the resultant fills the friction circle the two
 * components reach its edge together. The sign of each force flows through (a braking `fx<0` points
 * backward, etc.).
 */
export function forceEndpointsLocal(fx: number, fy: number, delta: number, scale: number): ForceEndpoints {
    const sin = Math.sin(delta);
    const cos = Math.cos(delta);
    return {
        longitudinal: {x: fx * sin * scale, y: -fx * cos * scale},
        lateral: {x: fy * cos * scale, y: fy * sin * scale},
    };
}
