# PRD: PedalsAppletActor

## Problem Statement

The player has no real-time visual feedback about the current state of the throttle and brake inputs while driving. The smoothed pedal values (`throttleInput`, `brakeInput`) exist on `VehicleActor` but are invisible to the player, making it hard to understand how the pedal smoothing and weight transfer feel during gameplay.

## Solution

Add a `PedalsAppletActor` — a child `ScreenElement` of `DrivingDashboardActor` — that displays two vertical yellow bars in real time: one for brake (left) and one for throttle (right). Each bar grows from the bottom upward proportionally to the pedal value `[0, 1]`. A yellow-outline track always shows the full available height, giving context even when pedals are released. The applet is the first element on the left side of the dashboard.

## User Stories

1. As a player, I want to see the current throttle level as a vertical bar on the dashboard, so that I can understand how much acceleration is being applied after smoothing.
2. As a player, I want to see the current brake level as a vertical bar on the dashboard, so that I can understand how hard the brakes are being applied after smoothing.
3. As a player, I want the bars to grow from the bottom upward, so that the visual metaphor matches the physical sensation of pressing a pedal down.
4. As a player, I want the brake bar to be on the left and the throttle bar on the right, so that the layout matches the physical layout of pedals in a real car.
5. As a player, I want a visible track outline even when a pedal is fully released, so that I can always read the indicator regardless of pedal state.
6. As a player, I want the pedal indicators to update every frame, so that the feedback is always in sync with the actual vehicle physics.
7. As a player, I want the applet to be visually contained within the dashboard, so that it does not overlap or interfere with other UI elements.
8. As a developer, I want the applet to be a standalone file, so that it can be developed, reviewed, and tested in isolation from the rest of the dashboard.
9. As a developer, I want the dashboard height to be a named constant, so that child applets can reference it without magic numbers.
10. As a developer, I want the vehicle reference to be injected via a `setVehicle()` method, so that the dashboard and applet are not coupled to the scene construction order.
11. As a developer, I want `PedalsAppletActor` to be created during `DrivingDashboardActor.onInitialize()`, so that the child lifecycle is fully managed by the parent.
12. As a developer, I want `DrivingDashboardActor.setVehicle()` to propagate the vehicle reference to all child applets, so that the scene only needs to know about the dashboard.

## Implementation Decisions

### Modules modified

- **`DrivingDashboardActor`** — add `static readonly HEIGHT = 64`; add `private pedalsApplet: PedalsAppletActor`; create and add the applet as a child in `onInitialize`; add `setVehicle(vehicle: VehicleActor)` that stores the reference and propagates it to the applet.
- **`PedalsAppletActor`** (new) — a `ScreenElement` that receives a `VehicleActor` reference and redraws two bars every frame.
- **`PlaygroundScene`** — after adding the dashboard, call `dashboard.setVehicle(player)`.

### Interfaces

- `DrivingDashboardActor.setVehicle(vehicle: VehicleActor): void` — called once by the scene after both dashboard and player are added.
- `PedalsAppletActor.setVehicle(vehicle: VehicleActor): void` — called by the dashboard internally.

### Architectural decisions

- **Base class**: `PedalsAppletActor` extends `ScreenElement` (anchor `(0, 0)` top-left), consistent with `DrivingDashboardActor`. This makes positioning intuitive: `pos = vec(MARGIN, MARGIN)` with `MARGIN = 8`.
- **Applet size**: `width = height = DrivingDashboardActor.HEIGHT - MARGIN * 2` = 48px (square).
- **Bar layout**: brake bar `20px` wide | `8px` gap | throttle bar `20px` wide, totalling `48px`.
- **Bar direction**: grows bottom-up; when pedal = 1, bar height = applet height; when pedal = 0, bar height = 0.
- **Track**: yellow-outline rectangle at full applet height, always visible, rendered before the filled bar.
- **Rendering**: graphics API only — rectangles redrawn in `onPostUpdate` every frame; no child actors for the bars.
- **Vehicle reference**: nullable, guarded — bars render as zero-height if vehicle is not yet set.

### Data flow

```
PlaygroundScene.onInitialize()
  → dashboard.setVehicle(player)
    → pedalsApplet.setVehicle(player)

PedalsAppletActor.onPostUpdate()
  → reads vehicle.brakeInput, vehicle.throttleInput
  → redraws track outlines and filled bars via graphics API
```

## Testing Decisions

### What makes a good test

Test only observable, external behavior — not internal rendering calls or private fields. A good test for `PedalsAppletActor` verifies that the correct bar dimensions are computed from the pedal values, not that a specific graphics API method was called.

### Modules to test

- **`PedalsAppletActor`** — unit tests verifying:
  - Applet dimensions are `DrivingDashboardActor.HEIGHT - 2 * MARGIN` (width and height).
  - `setVehicle()` stores the reference without throwing.
  - Bar height calculation: `brakeInput * appletHeight` and `throttleInput * appletHeight` return the correct pixel values for boundary inputs (0, 0.5, 1).
  - When no vehicle is set, bar heights are 0.

### Prior art

Existing unit tests in `src/models/vehicle-race-data.model.test.ts` and `src/services/math.service.test.ts` serve as style references: Jest, no mocking of internal collaborators, pure input/output assertions.

## Out of Scope

- Labels or text ("T" / "B") identifying each bar — purely visual enhancement, not needed for readability at this size.
- Color changes at thresholds (e.g. red brake bar at full pressure).
- Multiple vehicles or multiplayer dashboard layouts.
- Animation or easing on the bars beyond what the pedal smoothing already provides on `VehicleActor`.
- Applet visibility toggle or minimize behavior.

## Further Notes

- `throttleInput` and `brakeInput` on `VehicleActor` are already smoothed values (press/release rates defined by `throttlePressRate`, `throttleReleaseRate`, etc.), so the bars naturally animate without additional interpolation in the applet.
- The applet is the first element on the left of the dashboard; future applets (speed, gear, lap time) will follow to its right, so the 8px left margin is also the standard inter-element spacing to establish.