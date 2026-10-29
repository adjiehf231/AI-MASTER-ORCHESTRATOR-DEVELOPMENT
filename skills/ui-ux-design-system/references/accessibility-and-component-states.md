# Accessibility & Component States Reference

## 1. The 6 Mandatory UX States Reference

### A. Default Loaded State
Clean visual hierarchy, structured spacing (multiples of 4px / 8px), and clear text contrast.

### B. Interactive States
- **Hover:** Subtle background or border shift (`hover:bg-slate-50 dark:hover:bg-[#1e293b]`, `hover:border-slate-300 dark:hover:border-slate-700`).
- **Focus-Visible:** High contrast focus outline that is accessible for keyboard navigators:
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111827]`.
- **Active:** Micro tactile press `active:scale-[0.98] transition-all duration-150`.

### C. Loading Skeletons
Content-shaped skeleton shapes instead of generic spinners:
```html
<div class="animate-pulse space-y-3">
  <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
  <div class="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2"></div>
</div>
```

### D. Purposeful Empty States
Must never be a blank white box. Provide:
1. An icon inside a soft rounded container (`w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center`).
2. Title indicating the current empty scenario (`Belum Ada Lamaran / No Applications Yet`).
3. Explanation of how data gets here or what to do next.
4. Primary Action Button (`+ Buat Dokumen Baru / Create New`).

### E. Error States
- Clear, empathetic human language explaining what went wrong and how to fix it.
- Never dump raw stack traces, API keys, or internal HTTP error objects into user UI.
- Offer actionable retry button:
```html
<div class="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-rose-800 dark:text-rose-200 text-sm">
  <div class="flex items-center gap-2">
    <AlertCircle class="w-5 h-5 flex-shrink-0 text-rose-500" />
    <span>Gagal memuat data lowongan. Silakan coba kembali.</span>
  </div>
  <button class="px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700">Coba Lagi</button>
</div>
```

### F. Disabled States
- Clear visual dimming (`opacity-50 cursor-not-allowed`).
- Tooltip or helper text explaining the unmet condition (e.g. "Lengkapi profil Anda untuk mengaktifkan tombol ini").
- Set `aria-disabled="true"`.

---

## 2. WCAG 2.1 AA Accessibility Checklist
- **Contrast:** Minimum 4.5:1 for normal text against its background, 3:1 for large text ($\ge 18\text{pt}$ or $\ge 14\text{pt}$ bold) and UI components.
- **Icon-Only Buttons:** Must always have `aria-label` or `<span class="sr-only">Description</span>`.
- **Touch Targets:** Minimum $44 \times 44\text{px}$ clickable area for mobile usability.
- **Form Controls:** Every `<input>`, `<select>`, `<textarea>` must have an associated `<label>` (via `htmlFor` / `id` or wrapping `<label>`).
- **Headings:** Exactly one `<h1>` per page, followed by logical heading hierarchy (`<h2>`, `<h3>`).
