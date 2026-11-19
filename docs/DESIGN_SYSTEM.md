# Marina Tracker («Ритм») — Design System & Mobile PWA Specification

> Single source of truth for `@architect`, `@stylist`, `@feat-today`, `@feat-habits`, `@feat-nutrition`, and `@feat-home-goals`.
> Target device: **iPhone 14 Pro (`393 × 852 pt`)** in **Safari & Chrome Standalone PWA mode** (Add to Home Screen, full-screen edge-to-edge without browser bottom chrome) + graceful centered desktop frame (`> 480px`).

---

## 1. Brand Identity & Russian App Naming

- **App Name (`short_name` / `apple-mobile-web-app-title`)**: **«Ритм»**
- **Full Display Name (`manifest.webmanifest` `name` & `<title>`)**: **«Ритм · Личный трекер Марины»**
- **Description**: *«Спокойный ежедневный трекер привычек, питания, цикла, дома и долгосрочных целей»*
- **Tone of Voice**: Warm, calm, supportive, adult Russian — never nagging, never diet-punitive, never corporate jargon. Use natural Russian phrasing («Доброе утро, Марина», «Что сделано за день», «В графике», «Нужно внимание»).
- **App Icon Spec (`public/icons/icon.svg`, `apple-touch-icon.png` 180×180, `icon-192.png`, `icon-512.png`)**:
  - Background: Solid deep botanical forest `#1F634C` (with subtle warm top-left radial depth `#29795E` → `#174D3B`, full-bleed square for iOS `apple-touch-icon` — iOS applies its own squircle mask; safe padding ≥ 18% on all sides for `maskable` icons).
  - Emblem: Minimalist alabaster `#FAF8F5` twin concentric rhythm arcs (representing daily rhythm & long-term trajectory) + a warm rose-terracotta accent dot `#DF7B70` at the zenith. Zero text inside the icon.

---

## 2. Aesthetic DNA Extracted from Reference Applications

Synthesized directly from the three reference repositories on disk (read-only audit):

1. **From `digital_platform` (`frontend/src/styles.css`)**:
   - Signature organic botanical-pine primary (`#1B5C47` family) paired with crisp hairline borders and high-contrast ink.
   - `Manrope` headings with tight negative tracking (`-0.025em`) and `font-variant-numeric: tabular-nums` on every metric, time, and counter.
   - Battle-tested mobile Safari discipline: `font-size: 16px` + `min-height: 44px` on all inputs/selects/textareas to block iOS focus auto-zoom, `env(safe-area-inset-*)` padding, `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent`, `@media (prefers-reduced-motion: reduce)`.
2. **From `sewing_factory` (`web/style.css`, `web/ui.jsx`)**:
   - Refined light-mode craftsmanship (`color-scheme: light`): pure white cards `#FFFFFF` resting on a soft neutral canvas with 1px hairline borders instead of muddy heavy drop shadows.
   - Tinted semantic badge/status pairs (`*-soft` background + `*-border` hairline + high-contrast `*-ink` text).
   - Locally bundled `@fontsource-variable/inter` (zero CDN/FOUT failures offline), crisp tactile `translateY(0.5px)` press feedback, and clean dismissible `Toast` cards.
3. **From `ashna_express_pos` (`web/views/express/expressStyles.js`, `web/styles.css`)**:
   - High-velocity «Самокат» / Express thumb ergonomics on `390–393px` viewports: horizontal scrollable chip rails (`scrollbar-width: none`), tactile `− / +` `StepperPill` controls (ideal for meal portion scaling), instant one-tap pills, crisp bottom sheets with drag handle, and realistic mobile frame presentation on wide desktop screens.

**Hard Anti-Patterns (STRICTLY FORBIDDEN)**:
- NO dark-mode neon purple/cyan gradients, NO glassmorphic dark glows, NO flashy AI-slop hero banners.
- NO cluttered 3-column tiny widgets on 393px width.
- NO horizontal page overflow (`document.documentElement.scrollWidth <= window.innerWidth` at 393px).

---

## 3. Exact CSS Color Tokens (`web/styles/tokens.css`)

All surface, text, border, and domain colors are light-mode calibrated for WCAG AA+ contrast.

```css
:root {
  color-scheme: light;
  font-synthesis: none;

  /* Typography */
  --font-heading: 'Manrope Variable', 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-sans: 'Inter Variable', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;

  /* Warm Alabaster Paper & Pure White Card Surfaces */
  --canvas: #F7F5F0;              /* App background & <meta name="theme-color"> */
  --desktop-backdrop: #EAE5DC;    /* Outer frame backdrop on desktop (>480px) */
  --surface: #FFFFFF;             /* Primary cards, sheets, inputs */
  --surface-subtle: #F2EFE8;      /* Segmented tracks, recessed chips, empty tiles */
  --surface-hover: #EAE6DC;       /* Pressed/hover subtle surface */
  --surface-frosted: rgba(247, 245, 240, 0.86); /* Sticky top bar & bottom nav */

  /* Ink & Hairline Borders */
  --ink: #1C2621;                 /* Primary text (warm deep botanical charcoal) */
  --ink-secondary: #43534B;       /* Subheadings & secondary body */
  --muted: #6A7870;               /* Metadata, captions, inactive tabs */
  --subtle: #8F9C95;              /* Placeholders, muted icons */
  --border: #E5E0D6;              /* Primary card & divider hairline */
  --border-subtle: #EFECE4;       /* Inner list row hairline */
  --border-strong: #CFC9BC;       /* Input hover / phone bezel stroke */

  /* Domain 1: Today / Primary Brand (Deep Botanical Pine) */
  --brand: #1F634C;
  --brand-hover: #174E3B;
  --brand-active: #123D2E;
  --brand-soft: #E9F3EE;
  --brand-border: #C4DFD2;
  --brand-ink: #144434;
  --brand-ring: rgba(31, 99, 76, 0.18);

  /* Domain 2: Habits, Vitamins & Body (Fresh Sage-Emerald) */
  --habits: #2D7A5B;
  --habits-soft: #EAF5EF;
  --habits-border: #C3E2D1;
  --habits-ink: #1B543D;

  /* Domain 2b: Water Tracker (Clear Mineral Sky) */
  --water: #1D7EA8;
  --water-soft: #E8F5FA;
  --water-border: #BEE0EE;
  --water-ink: #135573;

  /* Domain 2c: Female Cycle Tracker (Warm Rose-Terracotta) */
  --cycle: #C85A66;
  --cycle-hover: #B04854;
  --cycle-soft: #FDF0F1;
  --cycle-border: #F2C9CE;
  --cycle-ink: #8E303B;
  --cycle-fertile: #D4844A;
  --cycle-fertile-soft: #FDF4EB;
  --cycle-fertile-border: #F2D6BA;

  /* Domain 3: Nutrition & Menu (Warm Amber-Olive) */
  --nutrition: #A66E1B;
  --nutrition-olive: #5B7334;
  --nutrition-soft: #FCF5E6;
  --nutrition-border: #EED9AE;
  --nutrition-ink: #734A0E;

  /* Domain 4: Home Chores & Shopping (Warm Terracotta-Sand / Slate) */
  --home: #8B634B;
  --home-soft: #F7F0EA;
  --home-border: #E3D1C3;
  --home-ink: #5E402E;

  /* Domain 5: Multi-Year Goals (Deep Indigo-Plum) */
  --goals: #55488E;
  --goals-soft: #F1EFF9;
  --goals-border: #D5CEEC;
  --goals-ink: #3B3068;

  /* Semantic Statuses */
  --success: #256F52;
  --success-soft: #EAF6F0;
  --success-border: #C2E2D2;
  --warning: #B36B16;
  --warning-soft: #FEF5E6;
  --warning-border: #F0D6A8;
  --danger: #BF3B4B;
  --danger-soft: #FDF0F1;
  --danger-border: #F0C6CB;

  /* Geometry, Radii & Spacing */
  --app-max-width: 430px;
  --page-px: 16px;
  --card-p: 16px;
  --section-gap: 14px;
  --nav-height: 64px;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);

  --radius-card: 20px;
  --radius-sheet: 24px;
  --radius-md: 14px;
  --radius-control: 12px;
  --radius-sm: 8px;
  --radius-pill: 999px;

  /* Subtle Tactile Elevation */
  --shadow-card: 0 1px 2px rgba(28, 38, 33, 0.04), 0 4px 12px rgba(28, 38, 33, 0.025);
  --shadow-fab: 0 6px 18px rgba(31, 99, 76, 0.24), 0 2px 5px rgba(28, 38, 33, 0.08);
  --shadow-sheet: 0 -8px 32px rgba(28, 38, 33, 0.14);
  --shadow-toast: 0 10px 28px rgba(28, 38, 33, 0.14), 0 2px 6px rgba(28, 38, 33, 0.06);
  --shadow-device: 0 24px 60px rgba(28, 38, 33, 0.14), 0 4px 14px rgba(28, 38, 33, 0.06);
}
```

---

## 4. Typography & Mobile Type Scale

### Font Packages (Installed Locally for Offline PWA)
Install both variable font packages via npm (`@architect`):
```bash
npm install @fontsource-variable/manrope @fontsource-variable/inter
```
Import at the top of `web/main.jsx` BEFORE CSS:
```js
import '@fontsource-variable/manrope';
import '@fontsource-variable/inter';
```
- **Manrope Variable** provides warm, balanced native Cyrillic for headings, greeting, numbers in hero rings, and card titles.
- **Inter Variable** provides ultra-crisp Russian UI text, lists, chips, and `font-variant-numeric: tabular-nums` for times (`08:40`), grams (`220 г`), water (`1250 / 2000 мл`), and calendar days.
- Zero external Google Fonts network requests required — loads instantaneously offline on iOS Home Screen.

### iPhone 14 Pro (393px) Type Scale
| Role | Font | Size / Line-Height | Weight | Tracking / Notes |
| --- | --- | --- | --- | --- |
| Hero Greeting (`h1`) | Manrope | `23px / 29px` | `700` | `-0.025em` |
| Section / Sheet Title (`h2`) | Manrope | `18px / 24px` | `700` | `-0.02em` |
| Card Title (`h3`) | Manrope | `15.5px / 21px` | `700` | `-0.012em` |
| Body / Row Label | Inter | `15px / 21px` | `500` | `0` |
| Meta / Subtitle | Inter | `13px / 18px` | `450` | `--muted` |
| Chip / Pill / Badge | Inter | `12px / 16px` | `600` | `tabular-nums` |
| Bottom Tab Label | Inter | `11px / 13px` | `600` | `letter-spacing: -0.01em` |
| Eyebrow / Overline | Inter | `11px / 14px` | `700` | `0.06em`, `uppercase` |
| **All Form Controls (`input`, `select`, `textarea`)** | Inter | **`16px / 22px` (MANDATORY)** | `450` | **Prevents iOS Safari auto-zoom on focus!** |

---

## 5. iPhone 14 Pro (`393 × 852`) Standalone PWA Geometry

### Required `index.html` Head Tags (`@architect`)
```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#F7F5F0" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Ритм" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
    <title>Ритм · Трекер Марины</title>
  </head>
```
> Why `apple-mobile-web-app-status-bar-style="default"` + `theme-color="#F7F5F0"`? On iOS Safari standalone mode with a warm light alabaster canvas, `default` keeps dark legible status-bar icons (time, Wi-Fi, battery) blended with `theme-color` around the Dynamic Island, avoiding white-on-light invisible status text while `viewport-fit=cover` still provides exact `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.

### Viewport, Safe Areas & Desktop Preview Frame (`@stylist`)
- **Edge-to-Edge Mobile (`<= 480px`)**:
  - `html, body { background: var(--canvas); overflow-x: clip; overscroll-behavior-y: none; }`
  - `.app-shell`: `min-height: 100dvh; width: 100%; display: flex; flex-direction: column; position: relative;`
  - Top sticky/safe header padding: `padding-top: max(12px, var(--safe-top));` (clears iPhone 14 Pro Dynamic Island `59px` automatically in standalone mode and looks crisp at `12px` in browser/testing).
  - `.app-main`: `flex: 1; padding: 12px var(--page-px) calc(var(--nav-height) + 28px + var(--safe-bottom)); display: flex; flex-direction: column; gap: var(--section-gap); min-width: 0;`
- **5-Tab Frosted iOS Bottom Navigation (`.bottom-nav`)**:
  - Fixed at viewport bottom (`position: fixed; bottom: 0; left: 0; right: 0; z-index: 40;`), centered to `max-width: var(--app-max-width); margin-inline: auto;` on desktop.
  - `min-height: calc(var(--nav-height) + var(--safe-bottom));`
  - `padding: 6px 6px max(8px, var(--safe-bottom));`
  - `background: var(--surface-frosted); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); border-top: 1px solid var(--border);`
  - 5 equal columns (`grid-template-columns: repeat(5, minmax(0, 1fr))`):
    1. `today` — **Сегодня** (icon: `Sun` or `Sparkles`, accent: `--brand`)
    2. `habits` — **Привычки** (icon: `HeartPulse` or `CheckCircle2`, accent: `--habits`)
    3. `nutrition` — **Питание** (icon: `UtensilsCrossed`, accent: `--nutrition`)
    4. `home` — **Дом** (icon: `Home`, accent: `--home`)
    5. `goals` — **Цели** (icon: `Target`, accent: `--goals`)
  - Each `.bottom-nav-item` is a `<button>` with `min-height: 48px`, icon pill (`46 × 28px`, `border-radius: 999px`) that illuminates in the active domain's soft tint, and `11px` crisp label (never wraps, never clips).
- **Desktop Presentation (`@media (min-width: 481px)`)**:
  - `body` displays `--desktop-backdrop` (`#EAE5DC`) with subtle top/bottom padding (`16px`).
  - `.app-shell` centers at `width: 100%; max-width: var(--app-max-width); margin: 0 auto; min-height: calc(100dvh - 32px); background: var(--canvas); border: 1px solid var(--border-strong); border-radius: 32px; box-shadow: var(--shadow-device); overflow: clip;`
  - `.bottom-nav` constrains to `max-width: calc(var(--app-max-width) - 2px); left: 50%; transform: translateX(-50%); bottom: 16px; border-radius: 0 0 31px 31px;` (and `.mt-sheet-backdrop` centers sheets to `max-width: var(--app-max-width)` so desktop testing mirrors iPhone 14 Pro 1:1).
- **Touch & Interaction Rules**:
  - Every tappable control (buttons, checkboxes, date cells, calendar days, close icons, stepper buttons) MUST have a hit area `>= 44 × 44px` (use padding or transparent pseudo-hit-area for visually smaller badges/dots).
  - Global `button, a, label { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }`.
  - Animations:
    - `@keyframes mt-check-pop`: `0% { transform: scale(0.84); } 55% { transform: scale(1.1); } 100% { transform: scale(1); }` (`220ms cubic-bezier(0.22, 1, 0.36, 1)`)
    - `@keyframes mt-sheet-up`: `from { transform: translateY(28px); opacity: 0; } to { transform: translateY(0); opacity: 1; }` (`220ms cubic-bezier(0.22, 1, 0.36, 1)`)
    - `@keyframes mt-fade-in`: `from { opacity: 0; } to { opacity: 1; }` (`160ms ease`)
    - `@media (prefers-reduced-motion: reduce)` disables non-essential transforms/animations cleanly.

---

## 6. Functional UX Patterns (Zero Clutter, One-Thumb Ergonomics)

1. **Optimistic Instant Taps**: Toggling a habit, vitamin, water glass, chore, task, or grocery item updates UI state immediately and persists via API; on failure, roll back and show a friendly Russian error toast.
2. **Horizontal 7-Day `DateStrip`**: Snap-scrollable strip (`scroll-snap-type: x proximity`, hidden scrollbar) showing weekday short label (`Пн`..`Вс`) + day number (`19`) + tiny completion dot indicator. If `selectedDate !== today`, displays a compact `Сегодня` return pill right beside the header.
3. **iOS `SegmentedControl`**: Recessed `--surface-subtle` pill track (`padding: 3px`, `border-radius: 13px`) with crisp white elevated active segment (`min-height: 36px`, total touch height `42–44px`). Used for 3-way switch in Habits (`Привычки | Тренировки | Цикл`) and 2-way switches in Nutrition (`Рацион дня | Меню блюд`) and Home (`Уборка и дела | Покупки`).
4. **Native iOS `Sheet` Bottom Drawer**:
   - Slides up from bottom over darkened scrim (`rgba(28, 38, 33, 0.42)`), `max-height: 90dvh`, `border-radius: var(--radius-sheet) var(--radius-sheet) 0 0`.
   - Top centered drag handle (`36 × 4px`, `--border-strong`), sticky header with title + `44×44px` close button (`X`), scrollable body (`overflow-y: auto; -webkit-overflow-scrolling: touch`), sticky action footer with `padding-bottom: max(16px, var(--safe-bottom))`.
   - Traps Escape key, closes on backdrop tap, prevents background body scroll while open.
5. **Tactile `StepperPill` (`− / +`)**: Borrowed from `ashna_express_pos`, upgraded to `44px` height on mobile for Nutrition portion scaling (`½`, `1`, `1.5`, custom grams) with live automatic kcal/gram recalculation.
6. **Progressive Disclosure**: Secondary details (water log history, bought grocery items, past goal check-in timeline, 12-month cycle list) stay neatly structured or collapsible so every screen breathes.

---

## 7. Shared Primitives Props Contract (`web/components/*`)

`@architect` implements these exact components and props; `@feat-*` workers import ONLY from these paths:

### `web/components/BottomNav.jsx`
```jsx
<BottomNav
  activeTab="today"        // 'today' | 'habits' | 'nutrition' | 'home' | 'goals'
  onSelectTab={(tab) => {}}
  badges={{ home: 3 }}     // optional numeric indicator dots per tab key
/>
```

### `web/components/Sheet.jsx`
```jsx
<Sheet
  open={boolean}
  onClose={() => {}}
  title="Новая задача"
  subtitle="Запланировать на сегодня" // optional
  footer={<button className="mt-btn mt-btn--primary mt-btn--wide">Сохранить</button>} // optional sticky footer
>
  {children}
</Sheet>
```

### `web/components/UiPrimitives.jsx`
1. **`SectionHeader`**:
   ```jsx
   <SectionHeader
     eyebrow="Четверг, 19 ноября"   // optional small overline
     title="Доброе утро, Марина"    // main h1/h2
     subtitle="Спокойный день"      // optional
     action={<button ... />}        // optional right-aligned CTA / icon button
   />
   ```
2. **`DateStrip`**:
   ```jsx
   <DateStrip
     selectedDate="2026-11-19"      // YYYY-MM-DD
     todayDate="2026-11-19"         // YYYY-MM-DD
     onSelectDate={(iso) => {}}
     markers={{ '2026-11-19': 'done' | 'partial' | 'period' }} // optional dot map
   />
   ```
3. **`SegmentedControl`**:
   ```jsx
   <SegmentedControl
     value="habits"
     onChange={(val) => {}}
     accent="habits"                // optional: 'brand' | 'habits' | 'nutrition' | 'home' | 'goals'
     options={[
       { value: 'habits', label: 'Привычки', count: 5 },
       { value: 'workouts', label: 'Тренировки' },
       { value: 'cycle', label: 'Цикл' },
     ]}
   />
   ```
4. **`ProgressRing`**:
   ```jsx
   <ProgressRing
     percent={72}                   // 0..100
     size={76}                      // px, default 72
     strokeWidth={7}                // default 7
     color="var(--brand)"           // CSS color or var()
     label="72%"                    // center main text (defaults to `${Math.round(percent)}%`)
     sublabel="день"                // optional small sub-text inside ring
   />
   ```
5. **`CheckRow`**:
   ```jsx
   <CheckRow
     checked={boolean}
     onToggle={() => {}}
     title="Витамин D3 2000 МЕ"
     subtitle="После завтрака · 08:25" // optional
     accent="habits"                   // 'brand' | 'habits' | 'water' | 'cycle' | 'nutrition' | 'home' | 'goals'
     badge={<Pill tone="habits">Витамин</Pill>} // optional inline/meta badge
     trailing={<button className="mt-icon-btn" ... />} // optional right actions
     strikethrough={false}             // true for tasks / groceries when checked
   />
   ```
6. **`Pill`**:
   ```jsx
   <Pill
     tone="neutral"  // 'neutral' | 'brand' | 'habits' | 'water' | 'cycle' | 'nutrition' | 'home' | 'goals' | 'success' | 'warning' | 'danger'
     active={false}  // solid filled active filter state
     onClick={fn}    // renders <button> if provided, else <span>
     icon={<Icon size={14} />}
   >
     Пилатес
   </Pill>
   ```
7. **`EmptyState`**:
   ```jsx
   <EmptyState
     icon={<Sparkles size={24} />}
     title="Пока ничего не добавлено"
     description="Нажмите кнопку ниже, чтобы добавить первую запись."
     action={<button className="mt-btn mt-btn--primary">Добавить</button>}
   />
   ```
8. **`FabButton`**:
   ```jsx
   <FabButton label="Добавить" onClick={() => {}} accent="brand" />
   ```
9. **`PwaInstallGuide`**:
   ```jsx
   <PwaInstallGuide open={boolean} onClose={() => {}} />
   ```
   Shows crisp Russian 3-step instructions for **iPhone Safari** («Поделиться» → «На экран «Домой»» → «Добавить») and **Chrome iOS** so Marina can install «Ритм» full-screen without the browser bottom bar.

---

## 8. Exact CSS Class Contract (`web/styles/*.css`)

`@stylist` implements these four modular stylesheets imported in order by `web/main.jsx`:
1. `web/styles/tokens.css` — Section 3 CSS variables + `@keyframes`
2. `web/styles/base.css` — Reset, typography, safe-area `.app-shell`, `.app-main`, desktop 430px frame, focus rings, `.tabular`, `.sr-only`, `.muted`
3. `web/styles/components.css` — Buttons, inputs, cards, `.bottom-nav`, `.mt-sheet*`, `.mt-date-strip*`, `.mt-segmented*`, `.mt-ring*`, `.mt-check-row*`, `.mt-pill*`, `.mt-chip-row`, `.mt-stepper*`, `.mt-empty`, `.mt-fab`, `.mt-toast*`
4. `web/styles/sections.css` — Domain-specific layouts for all 5 tabs:

| File / Area | Exact CSS Classes |
| --- | --- |
| **App Shell & Nav** | `.app-shell`, `.app-main`, `.app-header`, `.bottom-nav`, `.bottom-nav-item`, `.bottom-nav-item.is-active`, `.bottom-nav-pill`, `.bottom-nav-badge`, `.mt-toast-stack`, `.mt-toast`, `.mt-toast--success`, `.mt-toast--error`, `.mt-toast--info` |
| **Layout & Cards** | `.mt-section`, `.mt-stack`, `.mt-stack--sm`, `.mt-stack--lg`, `.mt-row`, `.mt-row--between`, `.mt-row--wrap`, `.mt-grid-2`, `.mt-card`, `.mt-card--compact`, `.mt-card--tinted`, `.mt-card-head`, `.mt-card-title`, `.mt-card-sub`, `.mt-divider`, `.mt-eyebrow` |
| **Buttons & Forms** | `.mt-btn`, `.mt-btn--primary`, `.mt-btn--secondary`, `.mt-btn--soft`, `.mt-btn--ghost`, `.mt-btn--danger`, `.mt-btn--sm`, `.mt-btn--wide`, `.mt-icon-btn`, `.mt-field`, `.mt-label`, `.mt-input`, `.mt-select`, `.mt-textarea`, `.mt-input-row`, `.mt-form-grid`, `.mt-form-error`, `.mt-fab` |
| **Shared Primitives** | `.mt-section-header`, `.mt-section-header-copy`, `.mt-date-strip`, `.mt-date-cell`, `.mt-date-cell.is-selected`, `.mt-date-cell.is-today`, `.mt-date-dot`, `.mt-segmented`, `.mt-segmented-btn`, `.mt-segmented-btn.is-active`, `.mt-ring`, `.mt-ring-svg`, `.mt-ring-track`, `.mt-ring-fill`, `.mt-ring-label`, `.mt-check-row`, `.mt-check-row.is-checked`, `.mt-check-box`, `.mt-check-body`, `.mt-check-title`, `.mt-check-meta`, `.mt-check-actions`, `.mt-pill`, `.mt-pill--{tone}`, `.mt-pill.is-active`, `.mt-chip-row`, `.mt-stepper`, `.mt-stepper-btn`, `.mt-stepper-val`, `.mt-empty`, `.mt-empty-icon` |
| **Bottom Sheet** | `.mt-sheet-backdrop`, `.mt-sheet`, `.mt-sheet-handle`, `.mt-sheet-head`, `.mt-sheet-body`, `.mt-sheet-footer`, `.mt-pwa-steps`, `.mt-pwa-step` |
| **Section 1: Today** | `.today-hero-card`, `.today-overview-row`, `.today-domain-grid`, `.today-domain-tile`, `.today-domain-tile--{habits\|nutrition\|home\|goals}`, `.today-cycle-banner`, `.today-quick-strip`, `.today-quick-btn`, `.today-task-meta`, `.today-priority-dot`, `.today-priority-dot--{high\|medium\|low}`, `.today-done-feed`, `.today-done-item`, `.today-reflection-card`, `.today-mood-row` |
| **Section 2: Habits, Water, Workouts, Cycle** | `.water-card`, `.water-meter`, `.water-meter-fill`, `.water-quick-row`, `.water-log-list`, `.habits-period-card`, `.habits-period-head`, `.habit-streak`, `.workout-type-grid`, `.workout-type-card`, `.workout-type-card.is-selected`, `.workout-week-strip`, `.workout-week-day`, `.workout-week-day.is-active`, `.cycle-hero`, `.cycle-stats-grid`, `.cycle-cal-header`, `.cycle-cal-weekdays`, `.cycle-cal-grid`, `.cycle-day`, `.cycle-day.is-outside`, `.cycle-day.is-today`, `.cycle-day.is-selected`, `.cycle-day.is-period`, `.cycle-day.is-period-light`, `.cycle-day.is-period-medium`, `.cycle-day.is-period-heavy`, `.cycle-day.is-predicted`, `.cycle-day.is-fertile`, `.cycle-day.is-ovulation`, `.cycle-day-dot`, `.cycle-legend`, `.cycle-history-list`, `.cycle-history-card` |
| **Section 3: Nutrition** | `.nutrition-summary-card`, `.nutrition-macros-row`, `.nutrition-macro-pill`, `.nutrition-slot-card`, `.nutrition-slot-head`, `.nutrition-slot-window`, `.nutrition-dish-row`, `.nutrition-time-badge`, `.nutrition-amount-badge`, `.nutrition-kcal-badge`, `.menu-catalog-card`, `.menu-catalog-item`, `.portion-preset-row` |
| **Section 4: Home** | `.home-progress-card`, `.home-progress-bar`, `.home-progress-fill`, `.chore-card`, `.chore-meta`, `.shopping-quick-bar`, `.shopping-group`, `.shopping-group-title`, `.shopping-bought-toggle` |
| **Section 5: Goals** | `.goals-banner`, `.goal-card`, `.goal-card-top`, `.goal-horizon-pill`, `.goal-pace-badge`, `.goal-pace-badge--on_track`, `.goal-pace-badge--at_risk`, `.goal-pace-badge--ahead`, `.goal-progress-row`, `.goal-habit-link`, `.goal-milestones`, `.goal-milestone-row`, `.goal-checkins`, `.goal-checkin-item` |

### Domain Accent Utility Attributes
Any `.mt-card`, `.mt-pill`, `.mt-check-row`, or `.bottom-nav-item` can also consume `data-accent="brand|habits|water|cycle|nutrition|home|goals"` so `@stylist` can bind `--accent`, `--accent-soft`, `--accent-border`, `--accent-ink` cleanly in CSS without duplicating rules.
