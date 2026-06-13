# Grill-me — Add `acceleration` Vector + `previousSpeed` to `VehicleActor`

Goal: give `VehicleActor` an `acceleration: Vector` whose `y` is the current
**longitudinal** acceleration and whose `x` is the **lateral** acceleration
(kept at `0` for now). The longitudinal value is derived from the change in
speed between frames, which requires a new `previousSpeed: number` field.

Context discovered during the interview: `AccelerationAppletActor`
(`src/ui/acceleration-applet.actor.ts`) currently renders its G‑meter dot from
`vehicle.weightTransfer`. This new `acceleration` vector is the eventual real
data source for that applet, which frames the sign/units decisions below.

---

## Question 1: Where should `acceleration.y` be computed and assigned each frame?

Options weighed: inside `computeSpeed()`, a new dedicated method, or in
`VehicleActor.onPostUpdate()`.

### Decision

A **new private method `updateAcceleration()`** in `DriveInputSystem`, called
from `update()` after `computeSpeed()` returns the new speed. This keeps
`computeSpeed()` pure (it just returns a number) and isolates the
acceleration / `previousSpeed` bookkeeping in one place.

---

## Question 2: What does `acceleration.y` hold — true acceleration (px/s²) or raw Δspeed (px/s)?

### Decision

**True acceleration in px/s²**: `acceleration.y = ΔsignedSpeed / dt`. This is
physically correct and frame‑rate independent. The magnitude can be large
(hundreds–thousands), so any consumer (e.g. the G‑meter applet) is responsible
for normalizing it for display.

---

## Question 3: How is the reverse sign applied (the prompt's "× -1 in reverse")?

### Decision

**Store `previousSpeed` as a positive magnitude; sign both endpoints at use.**

```
signedNow  = isReverse ? -speed         :  speed;
signedPrev = isReverse ? -previousSpeed :  previousSpeed;
accY       = (signedNow - signedPrev) / dt;
previousSpeed = speed;   // store positive magnitude
```

This matches the prompt literally ("`previousSpeed` va moltiplicata per -1
quando è ingranata la retromarcia"). `speed` coming out of `computeSpeed()` is
always a positive number, so both the current and previous speeds are signed
by the current `isReverse` state.

Note (edge case): reverse can only be toggled when `vel.magnitude < 1`
(`handleReverseToggle`), so `speed` is ≈0 at the moment `isReverse` flips. Any
sign-flip spike in `accY` on that frame is negligible. Accepted, not guarded.

---

## Question 4: Sign orientation — is speeding up positive or negative `y`?

### Decision

**Speeding up = positive `y`** (forward acceleration → `acc.y > 0`,
braking/decel → `acc.y < 0`). Standard math convention. The applet already
negates its longitudinal input when drawing (today: `y = -weightTransfer *
boundaryRadius`), so it will negate `acceleration.y` the same way — no special
screen-space convention baked into the physics value.

---

## Question 5: Which speed value feeds the Δ, and what is stored into `previousSpeed`?

`updateAcceleration()` runs after `computeSpeed()` but `applyKinematics()` then
lerps `vel` toward `heading * speed`, so `vel.magnitude ≠ speed`.

### Decision

**Use the `computeSpeed()` scalar.** Compare this frame's commanded `speed`
against `previousSpeed`, then store `previousSpeed = speed`. This is a clean
scalar‑to‑scalar comparison that reflects the dynamics model's intended speed,
and does not mix lateral grip / lerp lag into the longitudinal acceleration.

---

## Question 6: How to handle `dt ≈ 0` (paused / first tick) so `Δspeed / dt` doesn't blow up?

### Decision

**Guard it.** If `dt <= 0` (or below a tiny epsilon), set `acceleration.y = 0`
for that frame and still update `previousSpeed`. Prevents `Infinity`/`NaN` from
leaking into the vector or any consumer.

---

## Question 7: How is the `acceleration` Vector written each frame (x stays 0)?

### Decision

**Mutate `.y`, leave `.x`**: `drivable.acceleration.y = accY` (and on the dt
guard, `= 0`). `x` is initialized to `0` and never touched while the lateral
component is ignored. Avoids allocating a new `Vector` every frame and
preserves the reference for any holder.

---

## Implementation summary

### `VehicleActor` (`src/actors/vehicle.actor.ts`) — new fields

```ts
// current acceleration: y = longitudinal (px/s²), x = lateral (px/s², 0 for now)
public acceleration: Vector = vec(0, 0);
// speed magnitude from the previous frame (always positive; signed at use)
public previousSpeed: number = 0;
```

### `DriveInputSystem` (`src/systems/drive-input.system.ts`)

In `update()`, after `const speed = this.computeSpeed(drivable, delta);`:

```ts
this.updateAcceleration(drivable, speed, delta);
this.applyKinematics(drivable, speed, delta);
```

New method:

```ts
private updateAcceleration(drivable: VehicleActor, speed: number, delta: number) {
    const dt = delta / 1000;
    if (dt <= 0) {
        drivable.acceleration.y = 0;
        drivable.previousSpeed = speed;
        return;
    }
    const signedNow  = drivable.isReverse ? -speed                 :  speed;
    const signedPrev = drivable.isReverse ? -drivable.previousSpeed :  drivable.previousSpeed;
    drivable.acceleration.y = (signedNow - signedPrev) / dt; // x stays 0
    drivable.previousSpeed = speed; // positive magnitude
}
```

### Out of scope (this change)

- Lateral acceleration (`acceleration.x`) stays `0`.
- Rewiring `AccelerationAppletActor` to read `acceleration` instead of
  `weightTransfer` (separate step in this issue).