# Plan: PedalsAppletActor

> Source PRD: resources/issues/0018-pedals-applet/prd.md

## Architectural decisions

- **Base class**: `PedalsAppletActor` extends `ScreenElement` (anchor `(0,0)`, top-left), consistent with `DrivingDashboardActor`.
- **Key models**: `VehicleActor.throttleInput` and `VehicleActor.brakeInput` are the data source — smoothed `[0,1]` values, already updated by `DriveInputSystem`.
- **Wiring**: scene → `DrivingDashboardActor.setVehicle()` → `PedalsAppletActor.setVehicle()`. No events, no polling the scene graph.
- **Rendering**: graphics API only, rectangles redrawn in `onPostUpdate` every frame. No child actors for bars.
- **Layout constants**: `MARGIN = 8`, `BAR_WIDTH = 20`, `GAP = 8`. Applet size = `DrivingDashboardActor.HEIGHT - MARGIN * 2` = 48px square.

---

## Phase 1: Applet scaffold

**User stories**: 7, 8, 9, 11

### What to build

Extract the dashboard height into a named static constant. Create `PedalsAppletActor` as a `ScreenElement` with the correct dimensions (48×48) and position (8px margin from the top-left of the dashboard). The dashboard creates and adds the applet as a child in its `onInitialize`. The applet is visible in the correct position with a neutral background — no pedal data yet.

### Acceptance criteria

- [ ] `DrivingDashboardActor` exposes a `static readonly HEIGHT` constant used for its own height and referenced by the applet.
- [ ] `PedalsAppletActor` lives in its own file under `src/ui/`.
- [ ] The applet dimensions are `HEIGHT - 2 * MARGIN` for both width and height.
- [ ] The applet is positioned as the first element on the left of the dashboard with `MARGIN` px of clearance on all sides.
- [ ] The applet is visible in-game at the correct position without errors.

---

## Phase 2: Live pedal bars

**User stories**: 1, 2, 3, 4, 5, 6, 10, 12

### What to build

Add a `setVehicle(vehicle: VehicleActor)` method to both `DrivingDashboardActor` and `PedalsAppletActor`. The scene calls `dashboard.setVehicle(player)` after adding both to the scene; the dashboard propagates the reference to the applet. Every frame, the applet reads `brakeInput` and `throttleInput` from the vehicle and redraws:

- A yellow-outline track rectangle at full applet height (always visible).
- A solid yellow filled bar whose height is proportional to the pedal value, anchored to the bottom edge and growing upward.
- Brake bar on the left, throttle bar on the right, separated by a gap.

### Acceptance criteria

- [ ] `DrivingDashboardActor.setVehicle()` propagates the vehicle to `PedalsAppletActor`.
- [ ] `PlaygroundScene` calls `dashboard.setVehicle(player)` after both are added to the scene.
- [ ] Brake bar is on the left; throttle bar is on the right.
- [ ] Each bar grows from the bottom upward: full height at pedal = 1, zero height at pedal = 0.
- [ ] Yellow-outline track is always rendered at full applet height for both bars.
- [ ] Bars update every frame in sync with the vehicle physics.
- [ ] When no vehicle is set, bars render as zero-height without throwing.

---

## Phase 3: Unit tests

**User stories**: 8

### What to build

Jest unit tests for `PedalsAppletActor` covering the pure, logic-only behavior: dimension calculation and bar height computation. Tests follow the existing style in the codebase (no mocks of internal collaborators, pure input/output assertions).

### Acceptance criteria

- [ ] Test: applet width and height equal `DrivingDashboardActor.HEIGHT - 2 * MARGIN`.
- [ ] Test: bar height = `pedalValue * appletHeight` for boundary values `0`, `0.5`, and `1`.
- [ ] Test: bar height is `0` when no vehicle has been set.
- [ ] Test: `setVehicle()` does not throw and subsequent bar height calculations reflect the new vehicle's values.
- [ ] All tests pass with `npm run test:unit`.