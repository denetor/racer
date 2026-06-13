# Plan: Acceleration indicator driven by `VehicleActor.acceleration`

> Source PRD: `resources/issues/0029-acceleration-indicator/prd.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Data source**: the acceleration applet reads `VehicleActor.acceleration`
  (vector: `x` = lateral, `y` = longitudinal, px/s²). It stops reading
  `weightTransfer`.
- **Orientation**: `x` → horizontal dot offset (positive = right);
  `y` → vertical (positive / speeding up = dot **up** = negative canvas-y).
- **Full-scale**: a single, symmetric module constant `ACCEL_FULL_SCALE = 800`
  (px/s²) applied to both axes and both signs. Tunable in one place.
- **Clamping**: normalize the acceleration by full-scale, then clamp the
  **vector magnitude** to `1` (× boundary radius). The dot stays on/inside the
  circular boundary along the true acceleration direction. No per-component
  clamping.
- **Pure unit**: the dot-offset math is a pure function
  `calcDotOffset(acceleration: {x, y}, boundaryRadius) => {x, y}` that reads the
  module-level `ACCEL_FULL_SCALE` and returns the canvas offset. The render step
  is a thin caller.
- **No smoothing, no over-range cue**: the dot plots raw acceleration each frame
  and keeps its normal styling when pinned at the edge.
- **Removal scope**: `weightTransfer` is removed only from the applet and its
  test double. `VehicleActor.weightTransfer` and the `DriveInputSystem` grip
  model stay untouched.

---

## Phase 1: Rewrite the pure dot-offset function + tests

**User stories**: 7, 8, 10, 11, 14 (underpins 2, 3, 5, 6)

### What to build

Replace the `weightTransfer`-based `calcDotOffset` with the vector-based
contract above and introduce the `ACCEL_FULL_SCALE` constant. The function
normalizes the acceleration vector by full-scale, clamps the resulting magnitude
to 1, scales by the boundary radius, and negates y (speeding up → up). Rewrite
the existing `calcDotOffset` unit tests for the new contract. This phase changes
no render or actor behavior and is verifiable on its own via `npm run test:unit`.

### Acceptance criteria

- [ ] `ACCEL_FULL_SCALE` constant exists (value 800) and is the single source of the scale.
- [ ] `calcDotOffset` takes an acceleration vector `{x, y}` and a boundary radius and returns a canvas offset `{x, y}`.
- [ ] Zero acceleration → `{x: 0, y: 0}`.
- [ ] Positive y at full-scale → dot at top (`y = -boundaryRadius`); negative y at full-scale → dot at bottom (`y = +boundaryRadius`).
- [ ] Positive x → dot to the right.
- [ ] Intermediate magnitude scales proportionally.
- [ ] Over-range longitudinal (e.g. 2× full-scale) → clamped to the radius.
- [ ] Combined x+y over-range → vector magnitude clamped to the radius (dot stays inside the circle).
- [ ] `npm run test:unit` passes (existing `calcDotOffset` tests replaced, not left stale).

---

## Phase 2: Rewire the applet to `acceleration`

**User stories**: 1, 2, 3, 4, 5, 6, 9, 12, 13

### What to build

Change the applet's render step to read `vehicle.acceleration` (defaulting to a
zero vector when the vehicle is absent) and pass it to the Phase 1 function;
remove the `weightTransfer` read. Update the applet's `VehicleActor` test double
to expose an `acceleration` vector instead of `weightTransfer`. Leave the
vehicle's `weightTransfer` field and the physics grip model alone.

### Acceptance criteria

- [ ] The applet no longer references `weightTransfer` (source or test double).
- [ ] The dot position is driven by `vehicle.acceleration` via `calcDotOffset`.
- [ ] At runtime: dot moves up under throttle, down under braking, centers when coasting; hard braking pins it at the edge.
- [ ] `acceleration.x` being 0 keeps the dot horizontally centered (no regression in the lateral axis).
- [ ] `VehicleActor.weightTransfer` and `DriveInputSystem` grip logic are unchanged.
- [ ] `npm run build` succeeds (modulo the pre-existing, unrelated `grid-position-service.ts` tsc error).
- [ ] Applet construction tests still pass.
