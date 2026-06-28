/**
 * Shared debug palette for the physics debug widgets (text HUD and the on-vehicle overlay). Extracted
 * here so the base colour and the saturation colours live in one place and never diverge between the
 * two views.
 */

/** Base colour of every debug widget text/graphic (yellow). Also the "lateral-only" saturation case. */
export const COLOR_NORMAL = 'rgba(255, 255, 0, 1)';

/** Longitudinal saturation, drive side (wheelspin): orange. */
export const COLOR_WHEELSPIN = 'rgba(255, 160, 40, 1)';

/** Longitudinal saturation, brake side (lockup): red. */
export const COLOR_SATURATED = 'rgba(255, 80, 80, 1)';