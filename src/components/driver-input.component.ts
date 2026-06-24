import {Component} from "excalibur";

/**
 * Driving-intent contract between the input systems and the physics update system. The input
 * system (keyboard or, in the future, AI) writes normalized targets here; the update system reads
 * them and is indifferent to who produced them.
 *
 * The input system only fills these targets — no smoothing, no physics. The update system applies
 * the actuation (pedal/steer smoothing, propulsion, integration).
 */
export class DriverInputComponent extends Component {
    public throttleTarget: number = 0;            // [0, 1]
    public brakeTarget: number = 0;               // [0, 1]
    public steerTarget: number = 0;               // [-1, 1]  negative = left, positive = right
    // One-shot request to flip reverse gear. The update system consumes (clears) it once handled.
    public reverseToggleRequested: boolean = false;
}