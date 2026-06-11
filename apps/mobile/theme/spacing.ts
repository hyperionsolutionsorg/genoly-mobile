/**
 * Spacing scale per DESIGN.md §5. Don't invent intermediate values —
 * if you reach for 10 or 20, you almost certainly want 8, 12, 16, or 24.
 */
export const spacing = {
  /** tight icon-text gap */
  xs: 4,
  /** default gap inside small containers, button-to-button gap */
  sm: 8,
  /** metric row padding, input padding, button vertical padding */
  md: 12,
  /** section body padding, card padding */
  lg: 16,
  /** screen padding, screen-title bottom margin */
  xl: 24,
  /** gap between major sections */
  xxl: 32,
} as const;

export const radius = {
  /** buttons, inputs, small cards */
  sm: 8,
  /** grouped section bodies, large cards */
  md: 12,
} as const;

/** Minimum tap target (Apple HIG + Android a11y) */
export const MIN_TOUCH_TARGET = 44;
