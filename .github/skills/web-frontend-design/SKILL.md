---
name: frontend-design
description: Create polished, production-grade UI/UX that respects existing design patterns while elevating visual quality. Use this when the user needs components, pages, or features that feel intentional, cohesive, and professionally designed.
---

This skill guides the creation of high-end, production-ready frontend interfaces. The objective is to produce code that is aesthetically superior and user-centric, focusing on "Design System" quality rather than experimental or erratic styling.

## Design Philosophy: "Context First"

Before generating code, the agent must prioritize the existing environment over creative "flair." Follow these priorities:

1. **Environmental Harmony**: Analyze the existing codebase (CSS variables, tailwind.config, theme files). The output must feel like a natural extension of the current project.
2. **Refined UX**: Prioritize usability and clarity. A "great" UI is one where the user knows exactly what to do next.
3. **Intentionality**: Every design choice (a shadow, a radius, a padding value) must have a logical reason based on the component's purpose.

## Implementation Guidelines

### 1. Typography & Hierarchy

- **Respect the Stack**: Use the project's existing font families. If no font is defined, default to a clean, modern sans-serif stack (system-ui) rather than importing exotic web fonts unless specifically asked.
- **Scale**: Use a logical typographic scale (e.g., 1.250x). Focus on font-weight and letter-spacing to create distinction rather than switching typefaces.

### 2. Theming & Color

- **Design Tokens**: Strictly use existing CSS variables (`--primary`, `--background`) or Tailwind colors.
- **Subtlety over Intensity**: Use "tonal" design. Instead of high-contrast "AI-style" gradients, use subtle border-colors, soft shadows, and refined background tints to create depth.

### 3. Layout & Spacing

- **The Grid**: Adhere to the project's layout system (Flexbox/Grid). Maintain consistent "rhythm" (using a base unit like 4px or 8px).
- **Whitespace**: Use generous but purposeful whitespace. Avoid "grid-breaking" or "asymmetrical" layouts unless the user explicitly requests an experimental landing page.

### 4. Interactions & Motion

- **Purposeful Animation**: Use motion to provide feedback or state changes (e.g., button hovers, layout transitions).
- **Duration/Easing**: Use standard durations (200ms-300ms) and professional easing (cubic-bezier or ease-in-out). Avoid "bouncy" or distracting entrance animations for standard UI elements.

## What to Avoid

- **Style Drift**: Do not introduce new font families, radical border-radii, or "unique" color palettes that clash with the rest of the application.
- **AI Slop**: Avoid the "generic SaaS" look (too many purple-to-blue gradients, oversized glassmorphism, and excessive rounded corners).
- **Over-Engineering**: Do not add complex libraries (like Framer Motion or 3D effects) unless the task specifically requires high-fidelity marketing visuals.

**CRITICAL**: Your goal is to be a world-class Product Designer, not an avant-garde artist. Create interfaces that are clean, accessible, and feel like they were written by a senior frontend engineer who cares about the long-term maintainability of the UI.
