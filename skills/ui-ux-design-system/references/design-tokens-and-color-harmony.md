# Design Tokens & Color Harmony Reference

## 1. The Obsidian Dark Mode Standard
High-end dark mode is built using layered neutral tones rather than pure `#000000` pitch black:

```css
:root[class~="dark"] {
  --bg-canvas: #0b0f19;       /* Deep obsidian canvas background */
  --bg-surface: #111827;      /* Rich dark slate for cards and panels */
  --bg-surface-elevated: #161f33; /* Inputs, nested containers, dropdowns */
  --border-subtle: rgba(255, 255, 255, 0.08); /* #1f2937 / #334155 */
  --border-interactive: rgba(255, 255, 255, 0.16);
  --text-primary: #f8fafc;    /* Crisp high-contrast white */
  --text-secondary: #94a3b8;  /* Readable muted slate */
  --text-tertiary: #64748b;   /* Helper / timestamp text */
}
```

### Card Hierarchy in Dark Mode:
1. **Base Layer:** Canvas `#0b0f19`
2. **Container Card Layer:** Surface `#111827` with `border border-slate-800/90` and `rounded-2xl`
3. **Internal Elements Layer:** Inputs, nested rows, or action pills `#161f33` with `border border-slate-700/80`
4. **Interactive Hover:** Card border lightens to `border-slate-700` with subtle elevation shadow

## 2. Light Mode Neutral Harmony
Clean light mode uses soft slates to avoid harsh glare:

```css
:root {
  --bg-canvas: #f8fafc;       /* Slate 50 */
  --bg-surface: #ffffff;      /* White cards */
  --bg-surface-elevated: #f1f5f9; /* Slate 100 for nested elements */
  --border-subtle: #e2e8f0;   /* Slate 200 */
  --border-interactive: #cbd5e1; /* Slate 300 */
  --text-primary: #0f172a;    /* Slate 900 */
  --text-secondary: #64748b;  /* Slate 500 */
  --text-tertiary: #94a3b8;   /* Slate 400 */
}
```

## 3. Semantic Provenance & Status Tokens
Ensure badges, banners, and status indicators communicate clearly:

| Status | Border | Background (Light / Dark) | Text |
| :--- | :--- | :--- | :--- |
| **Verified / Success** | `border-emerald-200 dark:border-emerald-800/60` | `bg-emerald-50 dark:bg-emerald-950/40` | `text-emerald-700 dark:text-emerald-300` |
| **Inferred / Warning** | `border-amber-200 dark:border-amber-800/60` | `bg-amber-50 dark:bg-amber-950/40` | `text-amber-700 dark:text-amber-300` |
| **Suggested / Advisory**| `border-indigo-200 dark:border-indigo-800/60`| `bg-indigo-50 dark:bg-indigo-950/40` | `text-indigo-700 dark:text-indigo-300` |
| **Danger / Failed** | `border-rose-200 dark:border-rose-800/60` | `bg-rose-50 dark:bg-rose-950/40` | `text-rose-700 dark:text-rose-300` |
