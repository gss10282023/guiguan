# Guiguan Design System (Apple‑inspired)

This project is an internal education system (Admin / Student / Teacher). The UI direction is **Apple‑like**: calm, light, high-clarity typography, soft surfaces, subtle depth, and smooth (but restrained) motion.

## Visual Direction

- **Aesthetic:** macOS/iOS-inspired “bento” cards, soft neutral backgrounds, large radii, subtle shadows, translucent sticky header.
- **Density:** information-dense, but never cramped; prefer grouping (cards/lists) and clear section titles.
- **Motion:** micro-interactions only (150–250ms); respect `prefers-reduced-motion`.
  - **Accent strategy:** macOS-style **tint color** (user-configurable). Avoid hard-coded “system blue”.

## Typography

- **Font family:** system UI stack (SF Pro on Apple devices).
- **Number formatting:** prefer `font-variant-numeric: tabular-nums` for amounts/times.
- **Scale (guideline):**
  - Title: 22–28px, semibold
  - Section title: 14–16px, semibold
  - Body: 14px, regular
  - Caption: 12px, regular, muted

## Color Tokens

### Light

- **Background:** `#F5F5F7`
- **Surface:** `#FFFFFF`
- **Surface (raised/hover):** `#F2F2F7`
- **Text:** `#1D1D1F`
- **Muted text:** `#6E6E73`
- **Border:** `#E5E5EA`
- **Accent (primary action):** Use a **tint** (e.g. Purple `#AF52DE`) or Graphite (neutral). Keep consistent across app.
- **Success:** `#34C759`
- **Warning:** `#FF9500`
- **Danger:** `#FF3B30`

### Dark

- **Background:** `#000000`
- **Surface:** `#1C1C1E`
- **Surface (raised/hover):** `#2C2C2E`
- **Text:** `#F2F2F7`
- **Muted text:** `#8E8E93`
- **Border:** `#3A3A3C`
- **Accent:** Use dark-mode tint (e.g. Purple `#BF5AF2`) or Graphite.
- **Success:** `#30D158`
- **Warning:** `#FF9F0A`
- **Danger:** `#FF453A`

## Layout & Spacing

- **Content width:** ~960–1100px max; keep consistent per app.
- **Spacing scale:** 4, 8, 12, 16, 24, 32.
- **Radii:**
  - Controls: 10–12px
  - Cards: 14–18px
  - Pills: 999px

## Components (UI rules)

### Vibrancy / Glass (Tahoe‑like)

- Use **frosted glass** for large surfaces (header, cards, dialogs): translucent background + `backdrop-filter: blur(...) saturate(...)`.
- Prefer **high transparency** (but keep legibility):
  - Light: white glass `~0.45–0.75` opacity
  - Dark: dark glass `~0.45–0.75` opacity
- Provide solid fallback when `backdrop-filter` isn’t supported.
- Always validate text contrast; glass needs stronger text + borders.

### Sticky Header

- Translucent background with blur (`backdrop-filter`), subtle border bottom.
- Navigation: prefer **segmented control** (not pill buttons) for top toolbar.

### Cards & Lists

- Cards: white/neutral surface, subtle border, soft shadow.
- Within a card, prefer **list rows** with separators (Apple Settings-style) over “card inside card”, when it improves scanning.

### Buttons

- Primary uses accent background; secondary is neutral surface with border.
- Press feedback: slightly darker background + minimal translate/scale (avoid layout shift).
- Disabled: reduced opacity, no hover emphasis.

### Inputs / Selects

- Neutral surface background, border + focus ring.
- Always show `:focus-visible` ring for keyboard navigation.

## Motion & Accessibility

- **Durations:** 150–250ms for hover/focus/press.
- **Easing:** ease-out for enter, ease-in for exit; avoid linear.
- **Reduced motion:** disable non-essential animations under `prefers-reduced-motion: reduce`.
- **Tap targets:** >= 40px height for touch-friendly controls.
