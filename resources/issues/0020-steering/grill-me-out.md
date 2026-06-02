# Issue #0020 – Rear-Axle Pivot Steering: Design Decisions

## Context

The bicycle kinematic model is already implemented in `drive-input.system.ts`
(`deltaTheta` formula is correct). The problem is that Excalibur integrates `vel`
from the actor's center (anchor `vec(0.5, 0.5)`), so the rotation pivot is the
sprite center instead of the rear axle. The fix is a small position correction
applied each frame in the system.

---

## Question 1: What does `rearAxlePosition` represent and what sign convention?

`frontAxlePosition = -33` (negative local Y = top of sprite = front of car)  
`rearAxlePosition = 35` (positive local Y = bottom of sprite = rear of car)

The rear axle world position is derived as:
`rearAxle_world = pos - heading.normalize() * rearAxlePosition`

### Decision:
Keep the existing sign convention. `rearAxlePosition` is a positive magnitude; the
direction (behind center, opposite to heading) is made explicit in the formula.

---

## Question 2: Where should the pivot correction be applied?

Options:
- **A** – Apply `(heading_new - heading_old) * rearAxlePosition` directly to
  `drivable.pos` inside `DriveInputSystem.update()`.
- **B** – Move the correction into `VehicleActor.onPreUpdate()`, keeping the system
  responsible only for heading/vel.

### Decision:
**Option A** — apply the correction in `DriveInputSystem.update()`. The correction
is a direct consequence of the `deltaTheta` calculation that lives in the same
method. Splitting it into the actor would require storing `heading_old` as actor
state just to pass it across the boundary.

Since `DriveInputSystem.priority = SystemPriority.Higher`, it runs before
Excalibur's `MotionSystem`, so writing to `drivable.pos` here is safe: the physics
integration adds `vel * dt` on top afterwards, giving the correct combined result.

---

## Question 3: Should `vel` reflect the true effective velocity (including the lateral correction)?

The lateral correction could be folded into `vel`:
`vel = heading_new * speed + (heading_new - heading_old) * rearAxlePosition / dt`

This would make `vel` physically correct for collision response.

### Decision:
**Keep `vel = heading * speed` (no lateral correction in vel).** The `/dt` term
makes the lateral velocity magnitude frame-rate dependent, which would cause
inconsistent collision responses at different frame rates. The arcade-game collision
inaccuracy from the lateral correction is negligible at ~60 fps.

---

## Question 4: (Revisited after Question 3 deliberation)

After exploring Option B (corrected vel, no direct pos write), the frame-rate
dependency problem was confirmed. Reverted to Option A (direct pos correction,
`vel = heading * speed`).

### Decision:
Confirmed **Option A**: direct `pos` correction in the system, `vel` unchanged.

---

## Question 5: Should `heading` be normalized each frame?

`Vector.rotate()` preserves magnitude mathematically, but floating-point rounding
accumulates over thousands of frames. A drifted magnitude corrupts the pivot
correction `(heading_new - heading_old) * rearAxlePosition`.

### Decision:
**Normalize `heading` after every `rotate()` call**, with a code comment explaining
why. The `sqrt` cost is trivial. This establishes a clean invariant: `heading` is
always a unit vector.

---

## Question 6: Where to capture `heading_old`?

`heading_old` must be saved before any call to `heading.rotate()`. The steering
angle updates above that line do not touch `heading`, so capturing at the top of the
entity block (right after `drivable` is assigned) is correct and safe.

### Decision:
Capture `heading_old = drivable.heading.clone()` immediately after the `drivable`
variable is assigned, before the steering/speed calculations.

---

## Question 7: Should a unit test be added for the pivot math?

### Decision:
**No unit test.** The change is three lines of math, verifiable by inspection. The
existing Playwright screenshot integration tests catch visual regressions. A unit
test would require mocking Excalibur internals for marginal gain.

---

## Implementation Summary

**File:** `src/systems/drive-input.system.ts`

```typescript
// top of entity block, before steering/speed calculations
const heading_old = drivable.heading.clone();

// ... existing steeringAngle and speed calculations unchanged ...

// existing heading/vel update — add .normalize() and remove redundant call in vel
drivable.heading = drivable.heading.rotate(deltaTheta).normalize(); // normalize each frame to prevent fp drift
drivable.vel = drivable.heading.scale(speed); // heading is already unit-length

// rear-axle pivot correction: shift pos so rotation appears to pivot at rear axle
// (heading_new - heading_old) * rearAxlePosition is the arc offset introduced by
// rotating around the rear axle instead of the sprite center
drivable.pos = drivable.pos.add(
    drivable.heading.sub(heading_old).scale(drivable.rearAxlePosition)
);
```

No changes needed to `VehicleActor`, `rearAxlePosition`, or test infrastructure.