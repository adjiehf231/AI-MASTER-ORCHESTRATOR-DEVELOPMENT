---
name: motion-animation-design
description: "Enterprise interaction motion and animation playbook — physics-based spring curves, choreographed micro-interactions, layout transitions, GPU-accelerated compositing (transform/opacity), Framer Motion / Motion One patterns, and WCAG 2.2 reduced-motion accessibility."
---

# Enterprise Interaction Motion & Animation Playbook — ${PROJECT_NAME}

Authoritative sources: The 12 Principles of Animation adapted for UI, WCAG 2.2 SC 2.3.3 (Animation from Interactions), Google Material Motion Guidelines, Apple Human Interface Guidelines, and the Enterprise Engineering Constitution (§1–§20).

This playbook defines the standardized engineering discipline for designing and implementing fluid, high-performance, accessible, and purposeful UI motion, interactive animations, and micro-interactions across ${PROJECT_NAME}.

---

## 1. The Anti-AI-Slop Meaningful Motion Principles

Motion in enterprise applications is not decorative decoration or superficial eye candy; it is a **functional communication channel**. Unnecessary animations that delay user intent, chaotic bouncy spring effects, or gratuitous spinning elements are strictly prohibited as "AI slop".

### The 4 Pillars of Meaningful Motion
1. **Purposeful:** Every animation must explain a change of state, provide direct tactile feedback for user input, or reinforce spatial orientation (where an object came from and where it is going).
2. **Subtle & Restrained:** Fast, crisp transitions ($150\text{ms} - 300\text{ms}$) that feel snappy rather than sluggish. Motion should be felt and perceived, never waited on.
3. **Hardware-Accelerated (Compositor-Only):** Animate exclusively on the GPU compositor thread (`transform` and `opacity`). Animating layout-triggering properties (`width`, `height`, `top`, `left`, `margin`, `padding`) is strictly banned.
4. **Universally Accessible:** Must respect user vestibular sensitivity and automatically yield to `prefers-reduced-motion: reduce` without breaking interactivity.

---

## 2. Motion Design Token System

To maintain visual harmony across components, all animations must consume standardized motion tokens:

### 2.1 Duration Tokens
| Token | Value | Appropriate Use Cases |
|---|---|---|
| `--duration-instant` | `75ms` | Instant micro-feedback: button clicks, active press depression, toggle switches. |
| `--duration-fast` | `150ms` | Small element transitions: hover borders, tooltip reveals, dropdown menus, icon state morphing. |
| `--duration-normal` | `250ms` | Medium component transitions: modal dialogs, slide-over panels, accordion expand/collapse, card scaling. |
| `--duration-moderate` | `350ms` | Major view updates: full-page transitions, route switching, large multi-stage drawers. |
| `--duration-slow` | `500ms` | Orchestrated reveals: complex multi-item staggered list entries, dashboard initializations. |

### 2.2 Easing & Cubic-Bezier Curves
| Token | Curve / Value | Behavior & Guidance |
|---|---|---|
| `--ease-enter` | `cubic-bezier(0.16, 1, 0.3, 1)` | **Decelerate / Ease-Out:** Enters fast and settles smoothly. Use for all incoming elements (modals, toasts, dropdowns). |
| `--ease-exit` | `cubic-bezier(0.7, 0, 0.84, 0)` | **Accelerate / Ease-In:** Starts gently and disappears quickly. Use for outgoing/dismissed elements. |
| `--ease-move` | `cubic-bezier(0.65, 0, 0.35, 1)` | **Standard / Ease-In-Out:** Balanced curve for elements moving between positions on screen. |
| `--ease-linear` | `linear` | Strictly reserved for continuous progress bars and spinners. |

### 2.3 Physics-Based Spring Configurations (Framer Motion / Motion Primitives)
```javascript
export const springTokens = {
  // Snappy: Buttons, toggles, segmented pills, tabs
  snappy: { type: 'spring', stiffness: 450, damping: 32, mass: 1 },
  
  // Smooth: Modal dialogs, slide-over sheets, expanding cards, shared layouts
  smooth: { type: 'spring', stiffness: 280, damping: 28, mass: 1 },
  
  // Gentle: Floating tooltips, subtle popovers, background highlights
  gentle: { type: 'spring', stiffness: 180, damping: 24, mass: 1 },
  
  // Interactive Gestures: Dragging, swipe dismissals, reordering
  gesture: { type: 'spring', stiffness: 350, damping: 25, mass: 0.8 }
};
```

---

## 3. Technical Implementation Patterns

### 3.1 GPU-Accelerated Compositing Invariant
Only animate properties handled directly by the GPU compositor:
- ✅ **Permitted:** `opacity`, `transform` (`scaleX/Y`, `translateX/Y/Z`, `rotate`).
- ❌ **Prohibited:** `width`, `height`, `top`, `bottom`, `left`, `right`, `margin`, `padding`, `max-height`.
- **Enforcement Rule:** To animate an expanding accordion or dropdown without layout thrashing, use `transform: scaleY()` with subgrid masking or Framer Motion's `layout` projection engine, which calculates matrix transforms under the hood.

### 3.2 Choreography & Staggered Reveal
When rendering collections (data tables, card grids, activity feeds), stagger child entrances to avoid visual clutter:
```tsx
// Framer Motion Choreography Standard
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04, // 40ms interval between items
      delayChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { ease: [0.16, 1, 0.3, 1], duration: 0.25 }
  }
};
```

### 3.3 Shared Element & Spatial Continuity
When an item expands from a list into a detail view:
- Use Framer Motion's `layoutId` or the native **View Transitions API** (`document.startViewTransition`):
  ```tsx
  <motion.div layoutId={`card-${item.id}`} className="rounded-xl bg-slate-900 border border-slate-800">
    <motion.h3 layoutId={`title-${item.id}`}>{item.title}</motion.h3>
  </motion.div>
  ```
- Spatial continuity guarantees users never lose track of context during navigation.

### 3.4 Tactile Micro-Interactions (Tailwind & CSS Tokens)
Interactive controls must provide subtle, immediate physical response:
- **Button Press:** `transition-transform duration-75 active:scale-[0.98]`
- **Card Hover Elevation:** `transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-700`
- **Icon Spin on Refresh:** `transition-transform duration-300 ease-in-out group-hover:rotate-180`
- **Skeleton Pulse:** `animate-pulse bg-slate-200 dark:bg-slate-800 rounded-lg` (`CLS = 0` layout reservation)

---

## 4. Inviolable Digital Accessibility & Vestibular Safety (WCAG 2.2 AA)

Animations must never induce dizziness, nausea, or motion sickness in users with vestibular disorders (WCAG 2.2 SC 2.3.3 Animation from Interactions).

### Mandatory Reduced-Motion Standards
1. **Global CSS Reset:**
   ```css
   @media (prefers-reduced-motion: reduce) {
     *, ::before, ::after {
       animation-duration: 0.01ms !important;
       animation-iteration-count: 1 !important;
       transition-duration: 0.01ms !important;
       scroll-behavior: auto !important;
     }
   }
   ```
2. **Tailwind Motion Adaptation:**
   Always pair motion classes with `motion-reduce` counterparts:
   ```html
   <div class="transition-transform duration-200 ease-out hover:-translate-y-1 motion-reduce:transform-none motion-reduce:transition-none">
   ```
3. **Framer Motion Integration:**
   Check for reduced-motion preferences programmatically:
   ```tsx
   import { useReducedMotion } from 'framer-motion';

   export function AnimatedCard({ children }) {
     const shouldReduceMotion = useReducedMotion();
     
     return (
       <motion.div
         initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ duration: shouldReduceMotion ? 0 : 0.25 }}
       >
         {children}
       </motion.div>
     );
   }
   ```

---

## 5. Performance Budget & 60/120fps Verification

Before approving any animated surface:
- **Frame Budget:** 60fps requires frame completion within $<16.6\text{ms}$; 120fps (ProMotion / modern displays) requires $<8.3\text{ms}$.
- **Cumulative Layout Shift (CLS):** Animations must produce $0.00$ CLS. Layout shifts caused by animations are treated as **S2 Performance Defects**.
- **CPU Idle Invariant:** Continuous animations (e.g. ambient pulsing or rotating loaders) must automatically pause when the element is off-screen using `IntersectionObserver` or CSS `content-visibility: auto`.
