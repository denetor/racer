# Steering system

i need to add the steering behaviour on the player vehicle.

The vehicle is described in the `src/actors/vehicle.actor.ts`:

- all positions are intended in pixels, and relative to Actor anchor, that lies th the center of the actor
- `frontAxlePosition` and `rearAxlePosition` are the distance of each axle fron the Actor center.
- `Math.abs(frontAxlePosition) + Math.abs(rearAxlePosition)` is the distance between the axles
- i need to apply the steeriing strategy described in `resources/doc/steering.md`
- heading of the vehicle is in the `Vehicle.heading` Vector. It contains a couple of values going from 0.0 to 1.0 that give the angle, in radians, where the vehicle is pointing
- velocity of the vehicle is in the `Vehicle.vel` Vector. It contains a couple of values giving the angle in radians, where the vehicle is pointing and the velocity magnitude
