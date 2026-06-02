# Issue #0022 – Reverse Gear: Design Decisions

## Context

The vehicle physics model tracks `speed` as a non-negative scalar and encodes direction
entirely in `heading`. `vel = heading.scale(speed)` is set each frame in `DriveInputSystem`.
Reverse gear means moving opposite to `heading` without flipping the heading itself.

---

## Question 1: How should the reverse state be represented on `VehicleActor`?

Options: `isReverse: boolean` vs a `Gear` enum (`Forward | Reverse | Neutral`).

### Decision:

`isReverse: boolean` on `VehicleActor`. An enum is only justified if numbered gears are
added later, which is not in scope. A boolean keeps the code flat and readable.

---

## Question 2: How should speed be handled in reverse in the physics loop?

`speed = drivable.vel.magnitude` is always ≥ 0. In reverse, the vehicle must move opposite
to `heading`.

Options: keep speed always ≥ 0 and negate `vel`; allow signed speed; use a separate
`reverseSpeed` variable.

### Decision:

Keep `speed` always ≥ 0. Apply sign at the final `vel` assignment:
```typescript
drivable.vel = drivable.heading.scale(isReverse ? -speed : speed);
```
All existing acceleration/braking/friction formulas are unchanged. The sign is a rendering
detail, not a physics detail.

---

## Question 3: How should steering behave in reverse?

In the bicycle kinematic model the pivot is the rear axle. When moving backward the
effective pivot swaps to the front axle, geometrically inverting the steering effect.

### Decision:

Negate `deltaTheta` when in reverse:
```typescript
const deltaTheta = (speed * Math.tan(effectiveSteering) / L) * dt * (isReverse ? -1 : 1);
```
This matches real-car intuition and requires a single multiplication.

---

## Question 4: Should the "R" key go through the `Keybindings` enum and `KeybindingsService`?

All existing controls use `Keybindings` enum → `KeybindingsService.getKeyFor()`.

### Decision:

Add `EngageReverse` to the `Keybindings` enum and map it to `Keys.KeyR` in
`KeybindingsService`. Consistent with the established pattern; centralises all key
mappings in one place.

---

## Question 5: Should the "R" key be detected with `wasPressed` or `isHeld`?

`wasPressed` fires once per keydown. `isHeld` fires every frame while the key is down.

### Decision:

`wasPressed`. Engaging a gear is a punctual action, not a continuous state. Avoids
edge cases if the game is paused while "R" is held.

---

## Question 6: What is the exact auto-disengage condition?

The requirement: reverse disengages automatically when the vehicle returns to speed 0.

### Decision:

Exact check `speed === 0` after the speed update (post-clamp). The clamp
`Math.max(speed, 0)` guarantees that `speed` reaches exactly `0.0` when deceleration
overshoots in a single frame. No epsilon threshold needed.

---

## Question 7: Where and how is `maxReverseSpeed` defined?

All vehicle physics properties (`maxSpeed`, `accelerationForce`, etc.) are public fields
on `VehicleActor`.

### Decision:

Add `maxReverseSpeed: number = 200` as a public property on `VehicleActor` (≈ 1/3 of
`maxSpeed = 600`). The speed clamp becomes:
```typescript
speed = Math.min(Math.max(speed, 0), isReverse ? drivable.maxReverseSpeed : drivable.maxSpeed);
```

---

## Question 8: Should there be a separate `reverseAccelerationForce`?

`accelerationForce = 300000` N produces ~300 px/s² acceleration. With `maxReverseSpeed = 200`,
full reverse speed is reached in under 1 second.

### Decision:

Reuse `accelerationForce`. The requirement specifies only a different max speed, not a
different force. Adding an unrequested property is over-engineering; calibration can
be done later via playtest.

---

## Question 9: Does the `Brake` key work while in reverse?

`Brake` subtracts from `speed` toward 0. In reverse, reducing `speed` to 0 naturally
stops the vehicle and triggers auto-disengage.

### Decision:

Brake works unchanged in reverse. The natural behavior (vehicle slows and stops) matches
player expectations. No additional code needed.

---

## Implementation Summary

### `src/enums/keybindings.enum.ts`
Add `EngageReverse` to the enum.

### `src/services/keybindings.service.ts`
Map `Keybindings.EngageReverse` → `Keys.KeyR`.

### `src/actors/vehicle.actor.ts`
Add two public fields:
```typescript
public isReverse: boolean = false;
public maxReverseSpeed: number = 200;
```

### `src/systems/drive-input.system.ts`

Key changes (in order within `update()`):

1. **Engage reverse** — before speed/heading update:
   ```typescript
   const engagingReverse = keyboard.wasPressed(KeybindingsService.getKeyFor(Keybindings.EngageReverse));
   if (engagingReverse && speed === 0) {
       drivable.isReverse = true;
   }
   ```

2. **Speed clamp** — use `maxReverseSpeed` when in reverse:
   ```typescript
   speed = Math.min(Math.max(speed, 0), drivable.isReverse ? drivable.maxReverseSpeed : drivable.maxSpeed);
   ```

3. **Auto-disengage** — after speed update, before heading/vel:
   ```typescript
   if (drivable.isReverse && speed === 0) {
       drivable.isReverse = false;
   }
   ```

4. **Steering inversion** — negate `deltaTheta` in reverse:
   ```typescript
   const deltaTheta = (speed * Math.tan(effectiveSteering) / L) * dt * (drivable.isReverse ? -1 : 1);
   ```

5. **Velocity direction** — negate heading scale in reverse:
   ```typescript
   drivable.vel = drivable.heading.scale(drivable.isReverse ? -speed : speed);
   ```