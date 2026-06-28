/**
 * Metric driving statistics for the force-based vehicle (spec §3.2), kept **separate** from the race
 * data ({@link VehicleRaceData}, laps/checkpoints). Fed each frame by the `PhysicDriveUpdateSystem`
 * with the SI state, so the logic is pure and bench-testable (no Excalibur). Holds the distance
 * travelled and the last stopping distance; the km/h speed stays derived on the fly (not stored).
 */

/**
 * Speed (m/s) above which a brake press opens a braking-distance episode. Below it the car is already
 * crawling, so the stopping distance would not be a meaningful metric.
 */
const BRAKE_EPISODE_MIN_SPEED = 5;

/** Speed (m/s) below which the car counts as stopped, closing a braking episode (saving its distance). */
const STOP_SPEED = 0.5;

/** Smoothed brake-pedal level above which the brake counts as "pressed" (above the smoothing residue). */
const BRAKE_PRESSED_THRESHOLD = 0.05;

export class VehicleStats {
    /** Total distance travelled (m), accumulated as `|vel| · Δt` every frame. */
    public distanceTraveled: number = 0;
    /** Last completed stopping distance (m): distance covered from brake press to a full stop. */
    public lastBrakingDistance: number = 0;

    // Current braking episode (private): whether one is open and the distance accrued so far.
    private brakingActive: boolean = false;
    private brakingDistance: number = 0;

    /**
     * Advances the statistics by one frame from the SI state: the body speed (`|vel|`, m/s, ≥ 0), the
     * smoothed brake pedal `brakeInput` ∈ [0, 1], and the timestep `dt` (s).
     *
     * Distance: accumulates `speed · dt` every frame.
     *
     * Braking distance (stopping distance): an episode **opens** when the brake is pressed and the
     * speed is above {@link BRAKE_EPISODE_MIN_SPEED}; while open it accumulates the distance covered.
     * It **closes saving** `lastBrakingDistance` once the car drops to {@link STOP_SPEED} (a stop), and
     * is **discarded** (saving nothing) if the brake is released first — so only true full-stop
     * episodes are recorded, and each new stop overwrites the previous value.
     */
    public update(speed: number, brakeInput: number, dt: number): void {
        this.distanceTraveled += speed * dt;
        this.updateBraking(speed, brakeInput, dt);
    }

    private updateBraking(speed: number, brakeInput: number, dt: number): void {
        const pressed = brakeInput > BRAKE_PRESSED_THRESHOLD;
        if (!this.brakingActive) {
            // Open an episode only from a meaningful speed, on a brake press.
            if (pressed && speed > BRAKE_EPISODE_MIN_SPEED) {
                this.brakingActive = true;
                this.brakingDistance = 0;
            }
            return;
        }
        // Released before stopping -> discard the episode (no save).
        if (!pressed) {
            this.brakingActive = false;
            this.brakingDistance = 0;
            return;
        }
        this.brakingDistance += speed * dt;
        // Reached a stop while still braking -> save the stopping distance and close the episode.
        if (speed <= STOP_SPEED) {
            this.lastBrakingDistance = this.brakingDistance;
            this.brakingActive = false;
            this.brakingDistance = 0;
        }
    }
}