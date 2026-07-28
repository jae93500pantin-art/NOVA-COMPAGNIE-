/**
 * Shared motion tokens — Apple-grade timing/easing.
 * One master easing curve for reveals, springs for direct interaction.
 */

export const ease = [0.22, 1, 0.36, 1] as const;

export const dur = { fast: 0.18, base: 0.3, slow: 0.5 } as const;

export const springSoft = { type: "spring", stiffness: 300, damping: 30, mass: 0.8 } as const;
export const springSnappy = { type: "spring", stiffness: 480, damping: 32, mass: 0.7 } as const;

/** Reveal-on-mount / on-scroll (subtle rise + fade). */
export const reveal = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: dur.slow, ease },
} as const;

/** Popover/panel that grows from its trigger. */
export const popover = {
  initial: { opacity: 0, scale: 0.96, y: -8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: -6 },
  transition: springSnappy,
} as const;

/** Stagger container + child for cascading lists. */
export const stagger = {
  container: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
  child: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: dur.base, ease },
  },
} as const;
