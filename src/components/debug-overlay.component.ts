import {Component} from "excalibur";

/**
 * Pure-data marker for the debug widgets that the {@link DebugOverlaySystem} commutes together (the
 * on-vehicle {@link VehicleDebugOverlay} and the {@link PhysicsDebugHud}). Holds only the visibility
 * flag; the system flips it on the toggle key and mirrors it onto the entity's graphics. Never placed
 * on the car sprite itself, so toggling never hides the vehicle.
 */
export class DebugOverlayComponent extends Component {
    public visible: boolean = true; // default ON at startup; the first toggle press turns it off
}