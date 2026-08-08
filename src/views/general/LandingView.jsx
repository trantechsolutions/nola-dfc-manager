import {
  ArrowRight,
  CalendarDays,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileSpreadsheet,
  Globe,
  Handshake,
  Languages,
  Lock,
  Monitor,
  Moon,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Users,
  WifiOff,
} from 'lucide-react';
import { useT } from '../../i18n/useT';
import { useTheme } from '../../theme/ThemeContext';
import { APP_NAME, PUB_NAME, PUB_URL } from '../../utils/constants';
import './landing.css';

/**
 * LandingView — the public front door at `/` for signed-out visitors.
 *
 * Marketing surface, but not a separate design system: it runs on the same
 * tokens, radius, shadow and weight rules as the app (DESIGN.md), and every
 * string comes from the `landing` i18n namespace so it ships bilingual like
 * the rest of the product. The night-match look is carried by CSS in
 * ./landing.css rather than by one-off utility soup.
 */

// The landing page is served from the marketing origin (canteramanager.com);
// every call to action crosses to the app on its own subdomain. VITE_APP_URL
// carries that origin. Unset — local dev, preview deployments — the links stay
// relative and resolve against whatever host is serving the page.
const APP_ORIGIN = (import.meta.env.VITE_APP_URL || '').replace(/\/$/, '');
const appHref = (path) => `${APP_ORIGIN}${path}`;

// Sample figures for the hero panel. Deliberately round and obviously fake —
// the caption underneath says so — so nobody reads them as a real club's books.
const SAMPLE = { balance: '$12,480', collectedPct: 78, cleared: 15, roster: 18 };

const FEATURES = [
  { id: 'ledger', icon: ReceiptText },
  { id: 'budget', icon: FileSpreadsheet },
  { id: 'fundraising', icon: Handshake },
  { id: 'schedule', icon: CalendarDays },
  { id: 'matchups', icon: CalendarClock },
  { id: 'roster', icon: ShieldCheck },
  { id: 'parents', icon: Users },
  { id: 'evaluations', icon: ClipboardCheck },
  { id: 'insights', icon: Sparkles },
];

const ROLES = ['manager', 'treasurer', 'parent'];
const STEPS = ['step1', 'step2', 'step3', 'step4'];
const STATS = ['roles', 'languages', 'offline', 'spreadsheets'];
const TOUCHLINE = [
  { id: 'offline', icon: WifiOff },
  { id: 'install', icon: Smartphone },
  { id: 'bilingual', icon: Languages },
  { id: 'secure', icon: Lock },
];

/** The Cantera mark — the quarried-stone pentagon inside the manager's ring. */
function BrandMark({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label={APP_NAME}>
      <defs>
        <linearGradient id="cnLanding" x1="128" y1="40" x2="384" y2="472" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#D26A4F" />
          <stop offset="1" stopColor="#A5382B" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="116" fill="url(#cnLanding)" />
      <path
        d="M 181 385.9 A 150 150 0 1 1 331 385.9"
        fill="none"
        stroke="#FFF6F2"
        strokeWidth="20"
        strokeLinecap="round"
        opacity="0.95"
      />
      <path d="M256 144 L356.8 217.2 L318.3 335.8 L193.7 335.8 L155.2 217.2 Z" fill="#FFF6F2" />
      <g stroke="#A5382B" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.85">
        <path d="M256 206 L297.8 236.4 L281.9 285.6 L230.1 285.6 L214.2 236.4 Z" />
        <path d="M256 206 L256 144" />
        <path d="M297.8 236.4 L356.8 217.2" />
        <path d="M281.9 285.6 L318.3 335.8" />
        <path d="M230.1 285.6 L193.7 335.8" />
        <path d="M214.2 236.4 L155.2 217.2" />
      </g>
    </svg>
  );
}

/** Pitch markings behind the dark slabs — halfway line, circle, boxes, arcs. */
function PitchMarkings() {
  return (
    <svg className="landing-markings" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="2">
        <rect x="40" y="30" width="1120" height="540" />
        <line x1="600" y1="30" x2="600" y2="570" />
        <circle cx="600" cy="300" r="92" />
        <rect x="40" y="150" width="150" height="300" />
        <rect x="1010" y="150" width="150" height="300" />
        <rect x="40" y="225" width="60" height="150" />
        <rect x="1100" y="225" width="60" height="150" />
        <path d="M40 70 A 40 40 0 0 0 80 30" />
        <path d="M1160 70 A 40 40 0 0 1 1120 30" />
        <path d="M40 530 A 40 40 0 0 1 80 570" />
        <path d="M1160 530 A 40 40 0 0 0 1120 570" />
      </g>
      <circle cx="600" cy="300" r="5" fill="rgba(255,255,255,0.22)" />
    </svg>
  );
}

export default function LandingView() {
  const { t, locale, toggleLocale } = useT();
  const { cycleTheme, theme } = useTheme();
  // Same light → dark → system cycle the app header uses, so the control means
  // the same thing before and after sign-in.
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  const navLinks = [
    { href: '#features', label: t('landing.nav.features') },
    { href: '#roles', label: t('landing.nav.roles') },
    { href: '#workflow', label: t('landing.nav.workflow') },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ═══ HEADER ═══ */}
      <header className="landing-header sticky top-0 z-[1030] border-b border-white/10">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:px-6">
          <a href="/" className="flex items-center gap-2.5 text-white">
            <BrandMark className="h-8 w-8" />
            <span className="text-base font-bold tracking-tight">
              Cantera<span className="hidden font-light sm:inline"> Manager</span>
            </span>
          </a>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-sidebar-foreground transition-colors hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={toggleLocale}
              className="rounded-lg p-2 text-sidebar-foreground transition-colors hover:bg-white/10 hover:text-white"
              aria-label={locale === 'en' ? 'Cambiar a español' : 'Switch to English'}
              title={locale === 'en' ? 'Español' : 'English'}
            >
              <Globe size={18} />
            </button>
            <button
              onClick={cycleTheme}
              className="rounded-lg p-2 text-sidebar-foreground transition-colors hover:bg-white/10 hover:text-white"
              aria-label={`Theme: ${theme}`}
              title={`Theme: ${theme}`}
            >
              <ThemeIcon size={18} />
            </button>
            <a
              href={appHref('/login')}
              className="ml-1 rounded-lg landing-btn-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors"
            >
              {t('landing.nav.signIn')}
            </a>
          </div>
        </div>
      </header>

      {/* ═══ HERO ═══ */}
      <section className="landing-pitch">
        <PitchMarkings />
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 md:px-6 md:pb-24 md:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            {/* Copy */}
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                <span className="landing-dot h-1.5 w-1.5 rounded-full bg-success" />
                {t('landing.hero.badge')}
              </span>

              <h1 className="landing-title mt-6 max-w-2xl font-bold tracking-tight text-white">
                {t('landing.hero.title')}
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-white/75 md:text-lg">
                {t('landing.hero.subtitle')}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href={appHref('/login')}
                  className="inline-flex items-center justify-center gap-2 rounded-lg landing-btn-primary bg-primary px-6 py-3 font-bold text-primary-foreground shadow-md transition-colors"
                >
                  {t('landing.hero.ctaPrimary')}
                  <ArrowRight size={18} />
                </a>
                <a
                  href={appHref('/calendar')}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/25 bg-white/10 px-6 py-3 font-semibold text-white transition-colors hover:bg-white/20"
                >
                  <CalendarDays size={18} />
                  {t('landing.hero.ctaSecondary')}
                </a>
              </div>

              <p className="mt-6 text-xs font-medium text-white/60">{t('landing.hero.note')}</p>
            </div>

            {/* Sample panel — a stripped-down read of the season overview */}
            <div className="landing-float">
              <div className="rounded-lg border border-white/15 bg-black/30 p-5 shadow-md backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-white/70">{t('landing.scoreboard.label')}</p>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/80">
                    <span className="landing-dot h-1.5 w-1.5 rounded-full bg-success" />
                    {t('landing.scoreboard.live')}
                  </span>
                </div>

                <div className="mt-5">
                  <p className="text-xs font-semibold text-white/60">{t('landing.scoreboard.balance')}</p>
                  <p className="landing-figure mt-1 text-4xl font-bold text-white">{SAMPLE.balance}</p>
                </div>

                <div className="mt-6">
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs font-semibold text-white/60">{t('landing.scoreboard.collected')}</p>
                    <p className="landing-figure text-sm font-bold text-white">{SAMPLE.collectedPct}%</p>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${SAMPLE.collectedPct}%` }} />
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-xs font-semibold text-white/60">{t('landing.scoreboard.nextEvent')}</p>
                    <p className="mt-1 text-sm font-bold text-white">{t('landing.scoreboard.nextEventValue')}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-xs font-semibold text-white/60">{t('landing.scoreboard.compliance')}</p>
                    <p className="landing-figure mt-1 text-sm font-bold text-white">
                      {t('landing.scoreboard.playersUnit', { done: SAMPLE.cleared, total: SAMPLE.roster })}
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-white/50">{t('landing.scoreboard.caption')}</p>
            </div>
          </div>

          {/* Score strip */}
          <div className="landing-rule my-12 md:my-16" />
          <dl className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {STATS.map((id) => (
              <div key={id}>
                <dt className="landing-figure text-3xl font-bold text-white">{t(`landing.stats.${id}.value`)}</dt>
                <dd className="mt-2 text-xs leading-relaxed text-white/60">{t(`landing.stats.${id}.label`)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="scroll-mt-14 border-b border-border py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <h2 className="max-w-2xl text-2xl font-bold tracking-tight md:text-3xl">{t('landing.features.heading')}</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">{t('landing.features.sub')}</p>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.id} className="landing-card rounded-lg border border-border bg-card p-6 shadow-sm">
                <span className="landing-chip-primary inline-flex h-10 w-10 items-center justify-center rounded-lg">
                  <feature.icon size={20} />
                </span>
                <h3 className="mt-4 font-bold">{t(`landing.features.${feature.id}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`landing.features.${feature.id}.body`)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ROLES ═══ */}
      <section id="roles" className="scroll-mt-14 border-b border-border bg-muted py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <h2 className="max-w-2xl text-2xl font-bold tracking-tight md:text-3xl">{t('landing.roles.heading')}</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">{t('landing.roles.sub')}</p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {ROLES.map((id) => (
              <article key={id} className="rounded-lg border border-border bg-card p-6 shadow-sm">
                <h3 className="text-lg font-bold">{t(`landing.roles.${id}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`landing.roles.${id}.body`)}</p>
                <ul className="mt-5 space-y-2.5">
                  {['p1', 'p2', 'p3'].map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm">
                      <Check size={16} className="mt-0.5 shrink-0 text-success" />
                      <span>{t(`landing.roles.${id}.${p}`)}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WORKFLOW ═══ */}
      <section id="workflow" className="scroll-mt-14 border-b border-border py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <h2 className="max-w-3xl text-2xl font-bold tracking-tight md:text-3xl">{t('landing.workflow.heading')}</h2>

          <ol className="mt-12 grid gap-8 md:grid-cols-4">
            {STEPS.map((id, i) => (
              <li key={id} className="relative">
                {/* Touchline between steps — desktop only, never after the last */}
                {i < STEPS.length - 1 && (
                  <span className="absolute left-10 right-0 top-4 hidden h-px bg-border md:block" aria-hidden="true" />
                )}
                <span className="landing-figure relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-bold">{t(`landing.workflow.${id}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`landing.workflow.${id}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ═══ TOUCHLINE / PWA ═══ */}
      <section className="border-b border-border bg-muted py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{t('landing.touchline.heading')}</h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">{t('landing.touchline.sub')}</p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {TOUCHLINE.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <span className="landing-chip-accent inline-flex h-9 w-9 items-center justify-center rounded-lg text-foreground">
                    <item.icon size={18} />
                  </span>
                  <h3 className="mt-3 font-semibold">{t(`landing.touchline.${item.id}.title`)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {t(`landing.touchline.${item.id}.body`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PUBLIC CALENDAR ═══ */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="flex flex-col items-start gap-6 rounded-lg border border-border bg-card p-8 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-xl font-bold tracking-tight md:text-2xl">{t('landing.calendarCta.title')}</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">{t('landing.calendarCta.body')}</p>
            </div>
            <a
              href={appHref('/calendar')}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-5 py-3 font-semibold transition-colors hover:bg-muted"
            >
              <CalendarDays size={18} />
              {t('landing.calendarCta.button')}
            </a>
          </div>
        </div>
      </section>

      {/* ═══ CLOSING CTA ═══ */}
      <section className="landing-pitch">
        <PitchMarkings />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6 md:py-28">
          <BrandMark className="mx-auto h-14 w-14" />
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-white md:text-3xl">
            {t('landing.finalCta.title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-white/75">{t('landing.finalCta.body')}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href={appHref('/login')}
              className="inline-flex items-center justify-center gap-2 rounded-lg landing-btn-primary bg-primary px-6 py-3 font-bold text-primary-foreground shadow-md transition-colors"
            >
              {t('landing.finalCta.primary')}
              <ArrowRight size={18} />
            </a>
            <a
              href={appHref('/login')}
              className="inline-flex items-center justify-center rounded-lg border border-white/25 bg-white/10 px-6 py-3 font-semibold text-white transition-colors hover:bg-white/20"
            >
              {t('landing.finalCta.secondary')}
            </a>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-border bg-card py-12">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="grid gap-8 md:grid-cols-[1.5fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5">
                <BrandMark className="h-8 w-8" />
                <span className="text-base font-bold tracking-tight">
                  Cantera<span className="font-light"> Manager</span>
                </span>
              </div>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {t('landing.footer.tagline')}
              </p>
            </div>

            <nav aria-label={t('landing.footer.product')}>
              <h3 className="text-sm font-semibold">{t('landing.footer.product')}</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#features" className="transition-colors hover:text-foreground">
                    {t('landing.nav.features')}
                  </a>
                </li>
                <li>
                  <a href="#workflow" className="transition-colors hover:text-foreground">
                    {t('landing.nav.workflow')}
                  </a>
                </li>
                <li>
                  <a href={appHref('/calendar')} className="transition-colors hover:text-foreground">
                    {t('landing.nav.calendar')}
                  </a>
                </li>
              </ul>
            </nav>

            <nav aria-label={t('landing.footer.account')}>
              <h3 className="text-sm font-semibold">{t('landing.footer.account')}</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href={appHref('/login')} className="transition-colors hover:text-foreground">
                    {t('landing.nav.signIn')}
                  </a>
                </li>
                <li>
                  <button onClick={toggleLocale} className="transition-colors hover:text-foreground">
                    {locale === 'en' ? 'Español' : 'English'}
                  </button>
                </li>
              </ul>
            </nav>
          </div>

          <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              © {new Date().getFullYear()}{' '}
              <a href={PUB_URL} className="font-semibold text-foreground hover:underline">
                {PUB_NAME}
              </a>
              . {t('landing.footer.rights')}
            </span>
            <span>{APP_NAME}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
