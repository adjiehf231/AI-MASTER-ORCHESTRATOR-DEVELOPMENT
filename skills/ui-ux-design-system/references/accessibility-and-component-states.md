# Accessibility & Component States Reference

## 1. UI State Matrix & Interactive Spectrum

### A. Universal 6-State Matrix (Views & Data Containers)
1. **Loading Skeletons:**
   Content-shaped skeleton blocks reserving geometry (`CLS = 0`):
   ```html
   <div class="animate-pulse space-y-3">
     <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
     <div class="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2"></div>
   </div>
   ```
2. **Purposeful Empty States:**
   Never render a blank container. Provide:
   - Curated SVG icon in an accent-tinted container (`w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center`).
   - Title indicating the empty condition (e.g. `Belum Ada Data / No Records Found`).
   - Instructional description explaining how data appears or next steps.
   - Primary Call to Action button (`+ Tambah Data / Create New`).
3. **Actionable Error States:**
   - Clear, empathetic human language explaining what went wrong and how to recover.
   - Never expose raw stack traces, API keys, or internal HTTP error objects.
   - Include inline retry affordance:
   ```html
   <div class="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-rose-800 dark:text-rose-200 text-sm">
     <div class="flex items-center gap-2">
       <AlertCircle class="w-5 h-5 flex-shrink-0 text-rose-500" />
       <span>Gagal memuat data. Silakan coba kembali.</span>
     </div>
     <button class="px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700">Coba Lagi</button>
   </div>
   ```
4. **Success State:** Clear visual confirmation with live region (`aria-live="polite"`).
5. **Denied State:** Transparent role/permission explanation without leaking internal database IDs.
6. **Stale/Offline State:** Cached view with non-intrusive re-sync indicator.

### B. Interactive Control States (Buttons & Inputs)
- **Default:** Clean visual hierarchy, compliant contrast, multiples of 4px/8px.
- **Hover:** Subtle background shift (`hover:bg-slate-50 dark:hover:bg-[#1e293b]`, `hover:border-slate-300 dark:hover:border-slate-700`).
- **Focus-Visible:** High contrast focus outline:
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111827]`.
- **Active:** Micro tactile press `active:scale-[0.98] transition-all duration-150`.
- **Disabled:** Dimmed appearance (`opacity-50 cursor-not-allowed`), `aria-disabled="true"`, with guidance tooltip.

---

## 2. WCAG 2.2 Level AA Accessibility Checklist
- **Contrast (1.4.3):** Minimum 4.5:1 for normal text against its background, 3:1 for large text ($\ge 18\text{pt}$ or $\ge 14\text{pt}$ bold) and UI components.
- **Focus Appearance (2.4.11):** Focus indicators must have a contrast ratio of $\ge 3:1$ against unfocused state and adjacent colors, with $\ge 2\text{px}$ perimeter area.
- **Target Size (2.5.8):** Minimum target size of at least $24 \times 24\text{px}$ for all pointer inputs (recommend $44 \times 44\text{px}$ for mobile touch targets).
- **Icon-Only Buttons (1.1.1):** Must always have `aria-label` or `<span class="sr-only">Description</span>`.
- **Form Controls (1.3.1, 4.1.2):** Every `<input>`, `<select>`, `<textarea>` must have an associated `<label>`.
- **Headings (1.3.1):** Exactly one `<h1>` per page, followed by logical heading hierarchy (`<h2>`, `<h3>`).
