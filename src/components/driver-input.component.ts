import {Component} from "excalibur";

/**
 * Driving-intent contract between the input systems and the physics update system. The input
 * system (keyboard or, in the future, AI) writes normalized targets here; the update system reads
 * them and is indifferent to who produced them.
 *
 * Step 0 / Phase 2 only wires the throttle; `brakeTarget`, `steerTarget` and `reverseToggleRequested`
 * are added in Phase 3.
 */
export class DriverInputComponent extends Component {
    public throttleTarget: number = 0; // [0, 1]
}
