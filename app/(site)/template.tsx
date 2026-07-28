"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Subtle page transition (Apple-style fade + rise) applied to every (site)
 * route. Respects prefers-reduced-motion (fade only).
 */
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
