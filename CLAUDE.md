# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Arcade top-down car racing game built with [Excalibur.js](https://excaliburjs.com/) (v0.32.0), TypeScript, and Vite.

## Commands

The command `docker compose up` runs the dev server on port 5173 with live-reload via volume mount.

Before launching any command enter first the container named `racer_app_1`.

```bash
npm run dev            # start dev server (http://localhost:5173)
npm run build          # tsc + vite build (required before integration tests)
npm run test:unit      # jest unit tests
npm run test:unit:watch # jest in watch mode
npm run test:integration # build then run Playwright screenshot tests
npm run test:integration-update # rebuild Playwright baseline snapshots
```

## Architecture

### ECS pattern (Excalibur)

The game uses Excalibur's Entity-Component-System model. The key rule: **components are pure data, systems contain all logic**.

- **Actors** (`src/actors/`) — Excalibur `Actor` subclasses. Own visual setup and actor-specific state (e.g., `VehicleActor` stores `heading: Vector` and `steeringAngle`).
- **Components** (`src/components/`) — Excalibur `Component` subclasses used as tags or data bags. `DrivableComponent` marks an actor as player-controllable.
- **Systems** (`src/systems/`) — Excalibur `System` subclasses. Query entities by component type and process them each tick. `DriveInputSystem` queries `[DrivableComponent]` and reads keyboard input.
- **Scenes** (`src/scenes/`) — Register systems and add actors. `PlaygroundScene` is the current active scene.

### Data flow

```
main.ts (Engine config) → PlaygroundScene.onInitialize()
  → world.add(DriveInputSystem)          // registers system
  → new VehicleActor + DrivableComponent // creates player entity
DriveInputSystem.update() → reads keyboard via KeybindingsService → mutates VehicleActor
```

### Services and enums

- `src/services/keybindings.service.ts` — static lookup from `Keybindings` enum to Excalibur `Keys`.
- `src/enums/keybindings.enum.ts` — canonical list of game actions (Accelerate, Brake, SteerLeft, SteerRight).
- `src/resources.ts` — all `ImageSource` assets declared here and added to the boot `Loader`. Add new spritesheets here.

### Path alias

`@` resolves to `./src/` (configured in both `vite.config.js` and `tsconfig.json`).

## Physics design intent

`VehicleActor` separates **heading** (where the vehicle points) from **vel** (actual movement vector). The planned physics model (`resources/doc/steering.md`) is the simplified bicycle kinematic model:

- Rotation pivot is the rear axle, not the center.
- Steering angle drives heading rotation only when speed > 0.
- A grip factor (0–1) controls how fast `vel` lerps toward `heading * speed`, enabling arcade understeer/oversteer without per-tire force simulation.

## Testing notes

Integration tests are Playwright screenshot comparisons against a production build (`vite preview` on port 4173). Updating snapshots requires running `npm run test:integration-update` and committing the new PNG files under `tests/main.spec.ts-snapshots/`.