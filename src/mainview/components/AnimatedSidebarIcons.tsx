import { motion } from "motion/react";
import type { ComponentPropsWithoutRef } from "react";

type AnimatedIconProps = ComponentPropsWithoutRef<typeof motion.svg>;

export function AnimatedInboxIcon(props: AnimatedIconProps) {
  return (
    <motion.svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <motion.path
        variants={{
          rest: { d: "M 22.00 7.00 L 13.03 12.70 A 1.94 1.94 0 0 1 10.97 12.70 L 2.00 7.00" },
          hover: { d: "M 22.00 7.00 L 13.03 09.70 A 1.94 1.94 0 0 1 10.97 09.70 L 2.00 7.00" },
          tap: { d: "M 22.00 7.00 L 13.03 01.30 A 1.94 1.94 0 0 1 10.97 01.30 L 2.00 7.00" },
        }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      />
    </motion.svg>
  );
}

export function AnimatedSentIcon(props: AnimatedIconProps) {
  return (
    <motion.svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <motion.g
        variants={{
          rest: { x: 0, y: 0, opacity: 1 },
          hover: { x: 2, y: -2, opacity: 1 },
          tap: {
            x: [0, 20, -10, 0],
            y: [0, -20, 10, 0],
            opacity: [1, 0, 0, 1],
            transition: { duration: 0.6, times: [0, 0.4, 0.6, 1], ease: "easeInOut" },
          },
        }}
      >
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </motion.g>
    </motion.svg>
  );
}

export function AnimatedDraftsIcon(props: AnimatedIconProps) {
  return (
    <motion.svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <motion.line
        x1="9"
        y1="13"
        x2="15"
        y2="13"
        variants={{
          rest: { pathLength: 1 },
          hover: { pathLength: 0.8 },
          tap: { pathLength: [1, 0, 1], transition: { duration: 0.4, ease: "easeInOut" } },
        }}
      />
      <motion.line
        x1="9"
        y1="17"
        x2="15"
        y2="17"
        variants={{
          rest: { pathLength: 1 },
          hover: { pathLength: 0.8 },
          tap: { pathLength: [1, 0, 1], transition: { duration: 0.4, delay: 0.1, ease: "easeInOut" } },
        }}
      />
    </motion.svg>
  );
}

export function AnimatedTrashIcon(props: AnimatedIconProps) {
  return (
    <motion.svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Bin Body */}
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />

      {/* Animated Lid */}
      <motion.g
        style={{ transformOrigin: "19px 6px" }}
        variants={{
          rest: { rotate: 0 },
          hover: { rotate: -15 },
          tap: { rotate: -45, transition: { type: "spring", stiffness: 300, damping: 15 } },
        }}
      >
        <path d="M3 6h18" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </motion.g>
    </motion.svg>
  );
}
