---
name: ui-ux-design-system
description: >-
  Expert guidance for modern UI/UX design, frontend aesthetics, fluid responsive layouts,
  design tokens, accessible components, micro-interactions, and eliminating generic AI-slop design.
  Use whenever designing, reviewing, improving, refactoring, or building web user interfaces,
  color systems, typography, dashboards, forms, landing pages, or user interaction workflows.
---

# Modern UI/UX & Design System Engineering Skill

This skill guides the agent to act as a **Principal UI/UX Designer & Senior Frontend Architect**. It enforces human-crafted design aesthetics, robust design token systems, fluid responsiveness across devices, accessibility standards, and the complete elimination of low-quality "AI slop".

---

## 1. Core Principles: The Anti-AI-Slop Standard

AI-generated interfaces often look unmistakably generic: excessive purple/blue gradients, random glowing background blobs, decorative dashboards with meaningless metrics, and random emoji replacements for icons. This skill strictly prohibits those patterns.

### Patterns to Avoid

- ❌ **No Emoji UI Icons:** Never use emojis (`👤`, `📁`, `🚀`, `⚡`, `🔍`, `💼`) for UI controls, navigation, or status badges. Use curated SVG icons (Lucide, Radix, Heroicons).
- ❌ **No Arbitrary Glows & Neon Blobs:** Avoid random `blur-3xl bg-purple-500/20` blobs behind cards unless explicitly requested as part of a brand identity.
- ❌ **No Fake/Decorative Dashboards:** Every metric, card, and chart must represent real or structured product data, never fake filler statistics.
- ❌ **No Boxed-In Desktop Views:** Do not confine desktop views to rigid `max-w-4xl` or `max-w-5xl` when viewed on widescreen displays (1440px–1920px+), leaving massive empty side gutters.
- ❌ **No Stark White Cards on Dark Canvas:** Dark mode is not just inverted black and white; it requires carefully layered obsidian and slate tonal hierarchy.

### Patterns to Enforce

- ✅ **Curated, Harmonious Color Palettes:** Defined canvas, surface, border, and accent tokens.
- ✅ **Fluid Responsive Grids:** Seamless scaling from 375px mobile to 1920px widescreen.
- ✅ **Subtle Micro-Interactions:** 150ms–200ms ease-out transitions, tactile button active states (`active:scale-[0.98]`), accessible focus rings.
- ✅ **Intentional Typography:** Clear font weight contrast (semibold/bold headings vs regular text), controlled line heights (`leading-relaxed`), and balanced title wrapping.
- ✅ **Semantic HTML & Accessibility:** Meaningful tags, full keyboard navigation, WCAG 2.1 AA contrast ratios.

---

## 2. Design Token Architecture

Always structure styles with layered semantic tokens rather than arbitrary ad-hoc hex codes:

### Dark Mode (Obsidian Palette)

- **Canvas / Background:** `#0b0f19` (Deep Obsidian) or `#090d16`
- **Surface / Card:** `#111827` (Rich Dark Slate)
- **Elevated / Interactive Surface:** `#161f33` or `#1e293b`
- **Subtle Borders:** `border-slate-800/80` or `rgba(255, 255, 255, 0.08)`
- **Interactive Hover Borders:** `hover:border-slate-700`
- **Primary Text:** `#f8fafc` (Slate 50)
- **Secondary / Muted Text:** `#94a3b8` (Slate 400)
- **Inputs & Controls:** `#161f33` background with `#334155` border and `#6366f1` (Indigo 500) focus ring

### Light Mode (Clean Slate Palette)

- **Canvas / Background:** `#f8fafc` (Slate 50)
- **Surface / Card:** `#ffffff` (Pure White)
- **Elevated Surface:** `#f1f5f9` (Slate 100)
- **Subtle Borders:** `border-slate-200/90`
- **Interactive Hover Borders:** `hover:border-slate-300`
- **Primary Text:** `#0f172a` (Slate 900)
- **Secondary / Muted Text:** `#64748b` (Slate 500)

### Provenance & Status Color Semantic Tokens

- **Verified / Success:** Emerald (`text-emerald-600 dark:text-emerald-400`, `bg-emerald-50 dark:bg-emerald-950/40`, `border-emerald-200 dark:border-emerald-800/60`)
- **Inferred / Warning / Pending:** Amber (`text-amber-600 dark:text-amber-400`, `bg-amber-50 dark:bg-amber-950/40`, `border-amber-200 dark:border-amber-800/60`)
- **Suggested / Advisory / AI:** Indigo / Violet (`text-indigo-600 dark:text-indigo-400`, `bg-indigo-50 dark:bg-indigo-950/40`, `border-indigo-200 dark:border-indigo-800/60`)
- **Critical / Danger / Destructive:** Rose (`text-rose-600 dark:text-rose-400`, `bg-rose-50 dark:bg-rose-950/40`, `border-rose-200 dark:border-rose-800/60`)

---

## 3. Fluid Responsive Layout Guidelines

To prevent awkward empty gutters on desktop monitors (e.g. 1680px, 1920px):

```css
/* Container Utility Pattern */
.app-container {
  width: 100%;
  padding-left: 1rem;
  padding-right: 1rem;
}
@media (min-width: 640px) { .app-container { padding-left: 1.5rem; padding-right: 1.5rem; } }
@media (min-width: 768px) { .app-container { padding-left: 2rem; padding-right: 2rem; } }
@media (min-width: 1024px) { .app-container { padding-left: 2.5rem; padding-right: 2.5rem; } }
@media (min-width: 1280px) { .app-container { padding-left: 3rem; padding-right: 3rem; } }
@media (min-width: 1536px) { .app-container { padding-left: 3.5rem; padding-right: 3.5rem; } }
```

### Grid Responsive Scaling Rules

- **Card Grids:** `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6`
- **Dashboard Stat Metrics:** `grid grid-cols-2 md:grid-cols-4 gap-4`
- **Content + Sidebar Views:** `grid grid-cols-1 lg:grid-cols-12 gap-8`, with main content taking `lg:col-span-8` and sidebar taking `lg:col-span-4`.

---

## 4. The 6 Mandatory UX States Checklist

Every UI component that displays dynamic data or handles user actions MUST support these 6 states:

1. **Default / Loaded State:** Well-spaced, balanced visual hierarchy, crisp iconography.
2. **Interactive States (Hover / Focus / Active):**
   - Hover: Subtle border contrast increase + slight shadow elevation.
   - Active: Tactile micro-depression (`active:scale-[0.98]`).
   - Focus: Visible, high-contrast focus rings (`focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2`).
3. **Loading State:**
   - Use skeleton pulse blocks matching actual content geometry (`animate-pulse bg-slate-200 dark:bg-slate-800 rounded-lg`).
   - Avoid blocking full-screen spinners when regional skeletons can be used.
4. **Empty State:**
   - Must include: Curated SVG icon in an accent-tinted container, informative header, descriptive subtitle, and clear primary CTA button.
5. **Error State:**
   - Specific, understandable error copy (never raw backend traces or codes).
   - Retry or remediation action directly in the error card.
6. **Disabled State:**
   - Visual reduction (`opacity-50 cursor-not-allowed`).
   - `aria-disabled="true"` with tooltips or guidance explaining how to enable the action.

---

## 5. Modern Web Platform Features

Leverage native modern web platform capabilities when appropriate:

- **CSS `:has()`:** Style parent containers based on input state or child elements without extra JS state.
- **Form Pseudo-Classes:** Use `:user-invalid` instead of `:invalid` so inputs do not show error borders before the user has touched them.
- **Scrollbar Styling:** `scrollbar-width: thin; scrollbar-color: ...`
- **Native Dialogs:** Use `<dialog>` with `::backdrop` for lightweight, accessible modals.
- **Font Rendering:** `text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased;`

---

## 6. Visual Verification Workflow

Before completing any UI change:

1. **Desktop Widescreen Audit:** Verify the rendered layout at 1680px or 1920px width. Ensure content fluidly distributes across the viewport without awkward left/right empty gutters.
2. **Mobile Audit:** Verify responsiveness at 375px or 390px. Ensure no horizontal scroll overflow and touch targets are $\ge 44\text{px}$.
3. **Theme Audit:** Test both Light and Dark modes to confirm contrast and absence of stark unstyled elements.
4. **Emoji Check:** Ensure zero emoji characters are used as UI icons.

---

## 7. Reference Manuals & Detailed Guides

For deeper implementation details, consult:

- [Responsive & Fluid Layouts Reference](./references/responsive-fluid-layouts.md)
- [Design Tokens & Color Harmony Reference](./references/design-tokens-and-color-harmony.md)
- [Accessibility & Component States Reference](./references/accessibility-and-component-states.md)
