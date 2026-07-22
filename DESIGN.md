# DESIGN.md — nola-dfc-manager

Foundation document. Read before visual changes. All design decisions trace back to this.

---

## 1. Purpose

A league operations PWA for a New Orleans youth soccer/football conference. Two audiences share the same data but use it differently:

- **Coaches & league admins** run rosters, ledgers, schedules, reconciliations. They want speed, density, and confidence the numbers are right.
- **Parents** check their kid's team, balance, and schedule — usually on a phone, often one-handed, often distracted.

The design must feel like **our league's tool**, not generic SaaS. Warmth and identity matter, but not at the cost of clarity when money or attendance is on screen.

**What users should feel:** "This is run well." Calm, organized, trustworthy with money, with a human face.
**What users should do:** Find what they need in one tap/click. Trust totals without re-checking math.
**What users should trust:** Balances, dates, rosters. Financial views especially must read as authoritative.

---

## 2. Audiences

### Primary A — Coach Carla (manager mode)

- 30s–50s, manages a team of 14 kids. Volunteer, time-strapped.
- Uses laptop on Sunday nights to reconcile dues; phone on the sideline.
- Needs: roster at a glance, who owes what, who's coming Saturday.
- Hates: hunting through menus, ambiguous totals, accidentally editing the wrong row.

### Primary B — Parent Pete (parent mode)

- 30s–40s, two kids in the league. Opens app 1–2x/week on phone.
- Needs: my kid's schedule, my balance, the next payment due.
- Hates: logging in twice, pinch-zooming on tables, financial jargon.

### Secondary — League Treasurer Tomás (admin mode)

- Reconciles bank statements monthly. Bulk uploads CSVs. Power user.
- Needs: spreadsheet-grade table clarity, audit trail, undo.

---

## 3. Aesthetic Direction — "Warm Community"

Reference points (in order of strength):

- **Linear's restraint** for admin tables and density.
- **Notion's warmth** for the parent-facing views (soft surfaces, gentle radius, human voice).
- **Local rec-league feel** — like the printed roster taped to the gym wall, made digital. Approachable, not corporate.

Anti-references:

- Not enterprise admin (no SAP, no Salesforce density-for-density's-sake).
- Not consumer fintech (no neon gradients, no card-everything).
- Not generic shadcn-default — current state is pure neutral gray; that's the starting point, not the destination.

**One sentence:** A neighborhood league's clipboard, redesigned by someone who cares.

---

## 4. Proportional System

**Ratio:** 3:4 (matches phone/tablet screens; gentler than golden, less rigid than 1:2).

**Spacing scale** (Tailwind units, derived from 4px base, 3:4 progression skipping steps):
`1 (4px) · 2 (8px) · 3 (12px) · 4 (16px) · 6 (24px) · 8 (32px) · 12 (48px) · 16 (64px) · 24 (96px)`

Pick **adjacent steps for relationship**, **skipped steps for hierarchy**. Never invent in-between values.

**Type scale** (rem, 3:4 progression from 1rem body):

- `xs 0.75 · sm 0.875 · base 1 · lg 1.125 · xl 1.25 · 2xl 1.5 · 3xl 1.875 · 4xl 2.25`
- Body text: `base` (16px). Table cells: `sm` (14px). Captions/meta: `xs` (12px). Page titles: `2xl`–`3xl`.

**Container widths:**

- Mobile: full-bleed with `px-4` gutters.
- Tablet: `max-w-3xl` content, `px-6`.
- Desktop admin: `max-w-7xl` for tables, `max-w-4xl` for forms.

---

## 5. Typography

**Already chosen:** Geist Variable (sans). Keep it — humanist-leaning, excellent screen rendering, single family covers UI + numeric.

**Roles:**

- UI, body, headings: Geist Variable.
- Numbers in financial tables: Geist with `font-variant-numeric: tabular-nums` so columns align.
- No second font. Resist pairing — Geist's weights (400/500/600/700) cover all hierarchy needs.

**Settings:**

- Body leading: `leading-relaxed` (1.625) for parent views, `leading-normal` (1.5) for dense admin tables.
- Headings: `tracking-tight` at `2xl`+ sizes only.
- Smart quotes, real em-dashes, no double spaces. Numbers right-aligned in money columns.

**Loading (required):** Geist Variable is imported in [src/main.jsx](src/main.jsx) via `@fontsource-variable/geist`. Tailwind's `font-sans` is wired to it in [tailwind.config.js](tailwind.config.js). Removing the import means falling back to OS defaults (San Francisco / Segoe UI / Roboto) — different per platform.

**Size discipline (NON-NEGOTIABLE):**

- Use the scale only: `text-xs` (12px), `text-sm` (14px), `text-base` (16px), `text-lg` (18px), `text-xl` (20px), `text-2xl` (24px), `text-3xl` (30px), `text-4xl` (36px).
- `text-[7-11px]` — **banned**. Sub-12px text fails legibility for parents on phones and is unreadable on Windows ClearType. The original codebase had 565 such uses; promoted to `text-xs`. If you need to differentiate two adjacent labels, use weight or color — not a 2px size delta.

**Uppercase discipline:** Use sparingly.

- OK: brand mark (sidebar `<h1>` club name), nav section dividers ("APP" / "CLUB" / "SEASON" / "TEAM"), pill/badge `<span>`s for status/type (e.g. role badges).
- Avoid: caption `<p>` and `<label>` text in stat blocks ("In Season", "Imported", "Errors"). Sentence case reads more honestly and respects the reader.
- `uppercase tracking-widest` compound is the loudest AI tell — **banned**. Original codebase had 164; removed.

**Weight discipline (NON-NEGOTIABLE):** When everything shouts, nothing is heard. Original codebase had 1,167 places using bold-or-heavier — the textbook AI-generated tell. Demoted across the board.

- `font-normal` (400) — default body, no class needed
- `font-medium` (500) — light emphasis, dense labels, metadata
- `font-semibold` (600) — most labels, table headers, button text, nav items (this is now the workhorse)
- `font-bold` (700) — page titles, primary CTAs, money totals, active states
- `font-black` (900) — **banned**. If you reach for it, something else in the hierarchy is wrong (size, color, spacing). Fix that instead.

---

## 6. Color System — Replace the Neutral Palette

Current state: all `oklch(_ 0 0)` (zero chroma = pure gray). This is why "color system feels reactive" — there is no color system.

**New palette — warm community:**

**Brand hue:** Deep saddle red `oklch(0.55 0.15 25)` — pulled from traditional Louisiana sports clubs (think LSU adjacent without copying), warm without being aggressive. Use sparingly: primary CTAs, active nav, brand marks.

**Surfaces (warm-tinted neutrals, not pure gray):**

- `--background`: `oklch(0.99 0.005 60)` — paper-warm white
- `--card`: `oklch(1 0 0)` — pure white floats on warm bg
- `--muted`: `oklch(0.96 0.008 60)` — subtle warm gray
- `--border`: `oklch(0.90 0.01 60)` — visible but quiet
- `--foreground`: `oklch(0.20 0.01 60)` — near-black with warm undertone

**Accent (cool, for depth):** Deep teal `oklch(0.50 0.08 200)` — used for secondary actions, info states, links. Warm primary + cool accent gives the depth the current all-gray palette lacks.

**Functional (conventions, not negotiable):**

- Success / paid / present: `oklch(0.60 0.13 145)` green
- Warning / due soon: `oklch(0.75 0.15 75)` amber
- Destructive / overdue / absent: `oklch(0.55 0.20 25)` (shares hue with brand — intentional; uses chroma + position to differentiate)
- Info / neutral state: the teal accent

**Dark mode:** shift L values, preserve chroma. Shadows are hue-shifted (warm shadows on warm surfaces, never pure black `rgba(0,0,0,_)` — use `oklch(0.10 0.02 60 / _)`).

**Accessibility:** No state communicated by color alone. Paid/unpaid gets a check/circle icon + color + text. Test palette in Sim Daltonism before shipping.

**Raw color shade rule (NON-NEGOTIABLE):** Any Tailwind raw color used for **text** must be **paired** for both modes. Single shades fail AA contrast in at least one mode (e.g. `text-emerald-500` is 3.2:1 on white = fail).

| Use                                        | Light shade      | Dark shade pair       |
| ------------------------------------------ | ---------------- | --------------------- |
| Text on white/light card                   | `text-{hue}-700` | `dark:text-{hue}-300` |
| Text on tinted card (e.g. `bg-emerald-50`) | `text-{hue}-700` | `dark:text-{hue}-300` |
| Slightly less weight                       | `text-{hue}-600` | `dark:text-{hue}-400` |

`text-{hue}-500` is **banned** — fails contrast everywhere. Raw `bg-{hue}-500` etc. are OK because they're surfaces, not text.

Prefer semantic tokens (`text-success`, `text-warning`, `text-destructive`, `text-muted-foreground`, `text-primary`, `text-accent`) over raw hues whenever the meaning fits — tokens already encode the light/dark pair correctly.

---

## 7. Composition Rules

- **One dominant element per view.** On the dashboard it's the balance card. On rosters it's the player list. On schedule it's the next event. Everything else recedes.
- **White space carries hierarchy first.** Reach for size, weight, color in that order — only after spacing has done its job.
- **Tables:** zebra-stripe with `--muted` (not borders). Borders only between header and body. Tufte's 1+1=3 — every line you add costs clarity.

**Radius discipline (NON-NEGOTIABLE):** Two values only.

- `rounded-lg` (var(--radius) = 0.625rem / 10px) — cards, buttons, inputs, modals, anything rectangular. The default.
- `rounded-full` — pills, avatars, icon bubbles, toggle thumbs. Anything intentionally circular.
- `rounded-xl`, `rounded-2xl`, `rounded-3xl` — **banned**. If a card needs a larger radius to feel friendlier, your spacing or color is wrong.

**Shadow discipline:**

- `shadow-sm` — default for raised surfaces (cards, sticky headers). Almost everything.
- `shadow-md` — modals, popovers, dropdowns, floating banners, FAB.
- `shadow-lg` — sparingly, for clearly elevated UI (active dragged item, primary modal).
- `shadow-xl`, `shadow-2xl` — **banned**. They scream "premium SaaS template."

---

## 8. Mode Switching (Manager vs Parent)

Same app, same auth, same data — different default density and emphasis based on role:

- **Manager/admin role:** denser tables, more controls visible, keyboard shortcuts, secondary actions inline.
- **Parent role:** card-first layout, larger touch targets, secondary actions behind a menu, friendlier copy ("Amount due" not "Outstanding balance").

Do **not** build two design systems. Same tokens, same components — different default props (density, what's surfaced).

---

## 9. Motion

- Default duration `150ms`, complex `250ms`. Cap at `300ms`.
- Ease-out for entering, ease-in for exiting, ease-in-out for transitions in place.
- No bounce. No spring overshoots. This is a finance-touching app — motion signals "responsive," not "playful."
- Respect `prefers-reduced-motion` — collapse to opacity-only transitions.

---

## 10. Responsive Strategy

- Mobile-first. Design parent flows for 375px width with one thumb.
- Touch targets ≥ 44×44px.
- Tables → cards below `md` (768px). Don't horizontally scroll critical financial data on phones; restructure.
- Fluid type with `clamp()` for page headings only; everything else uses scale steps.
- Test at: 375 (iPhone SE), 768 (iPad portrait), 1280 (laptop), 1920 (desktop).

---

## 11. Anti-Patterns to Avoid

- All-gray neutrals.
- Card-everything — only card things that are genuinely separable.
- Drop shadows as primary depth cue — use borders, surface tint, and warm/cool relationships first.
- Bounce easing, glassmorphism, cyan-on-dark, generic shadcn defaults.
- Color-only state indication.
- Borders on every table cell.
- `font-black` on anything — see §5.
- `rounded-xl/2xl/3xl` — see §7.
- `shadow-xl/2xl` — see §7.
- Pixel-value spacing outside the scale.
- "Always-dark" surfaces (e.g. dark sidebar on a light app). Surfaces follow the mode. Use `--sidebar` token for nav-like surfaces; it flips with mode like everything else.

---

## 12. Decision Log

When changing any of the above, append here with date + reason. Foundations should be slow-moving; if you're rewriting this monthly, the foundation isn't holding.

- **2026-05-22** — Initial draft. Stack: React 19 + Tailwind 3 + shadcn + Geist + Supabase PWA. Replaces default zero-chroma shadcn palette with warm-community palette (saddle red brand, warm-tinted neutrals, teal accent).
- **2026-05-22** — Brand discipline pass (`/brand`). Demoted all font weights one tier (1,167 bold-or-heavier across 54 files → workhorse is now `font-semibold`). Collapsed radius to `rounded-lg` + `rounded-full` only. Demoted `shadow-xl/2xl` → `shadow-md`. Reason: the codebase had the textbook AI-generated look (everything shouting, everything heavily rounded, everything floating). These three changes do more for visual quietness than any palette tweak could.
- **2026-05-22** — Typography pass (`/fonts`). Fixed real bug: Geist was declared but never imported, so users saw OS defaults. Wired `@fontsource-variable/geist` in main.jsx + `fontFamily.sans` in tailwind config. Promoted 565 hand-rolled `text-[7-11px]` sizes onto the scale (`text-xs` = 12px floor). Stripped 164 `uppercase tracking-widest` compounds and 55 caption-`<p>` uppercase uses; kept uppercase on nav dividers and status pills where it's a UI convention.
- **2026-07-21** — Brand identity: **Touchline → Cantera**. Swapped the product name and mark across the app — nav name fallbacks ([DesktopSidebar](src/components/DesktopSidebar.jsx), [MobileHeader](src/components/MobileHeader.jsx), [MobileMenu](src/components/MobileMenu.jsx)), the [login](src/views/general/LoginView.jsx) wordmark + inline mark, [index.html](index.html), [manifest.json](public/manifest.json), and the [service worker](public/service-worker.js) push-title fallback — and regenerated the full favicon/PWA icon set (SVG + 16/32/48 PNG + `.ico` + apple-touch 180 + android-chrome 192/512 full-bleed for maskable) from the new mark: the ball's pentagon cut like quarried stone. A club's _cantera_ is its youth academy (Spanish, "quarry"); the name is bilingual-native, fits the queued Spanish release, and is unique/ownable. Palette unchanged — terracotta/clay already read as fired earth + stone; `theme_color` stays slate `#0f172a`. Candidate brand kits live in [brand/](brand/) (`cantera-*` shipped; `touchline-*`/`keeper-*`/`linekeeper-*`/`alternatives-*` kept for reference).
- **2026-05-22** — Color legibility pass (`/color`). Tightened token contrast: light `--muted-foreground` 0.50 → 0.42 L (chips/badges now AA on muted bg); dark `--muted-foreground` 0.70 → 0.78 L. Brightened dark status tokens (`--success`, `--warning`, `--destructive`, `--accent`, `--primary`) by ~0.05–0.10 L so status text stops feeling dim. Dark borders 12% → 18% opacity. Promoted 39+ unpaired `text-{hue}-500` and 42+ unpaired `text-{hue}-600/700` to proper `text-{hue}-700 dark:text-{hue}-300/400` pairs across ~40 files. Banned bare `text-{hue}-500` for text per the raw shade rule above.
