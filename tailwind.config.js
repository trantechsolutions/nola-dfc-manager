// The palette stores finished colours (`--primary: #23407a`, or a var() that
// resolves to one), not channel triplets — so a bare `var(--primary)` gives
// Tailwind nothing to apply an opacity modifier to, and `bg-primary/10`
// compiled to invalid CSS that browsers silently dropped. Routing every token
// through color-mix with Tailwind's <alpha-value> placeholder makes the
// modifiers work: with no modifier the mix is 100% and the colour is unchanged.
const token = (name) => `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist Variable', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Scoreboard figures for the three numbers a family looks for — the
        // match date, the jersey number, the score. Never body text or money.
        numeral: ['Big Shoulders Display Variable', 'Geist Variable', 'ui-sans-serif', 'sans-serif'],
      },
      borderColor: {
        border: 'var(--border)',
      },
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        canvas: token('canvas'),
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        popover: { DEFAULT: token('popover'), foreground: token('popover-foreground') },
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
        secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        accent: { DEFAULT: token('accent'), foreground: token('accent-foreground') },
        destructive: { DEFAULT: token('destructive'), foreground: token('destructive-foreground') },
        success: { DEFAULT: token('success'), foreground: token('success-foreground') },
        warning: { DEFAULT: token('warning'), foreground: token('warning-foreground') },
        sidebar: {
          DEFAULT: token('sidebar'),
          foreground: token('sidebar-foreground'),
          muted: token('sidebar-muted'),
          heading: token('sidebar-heading'),
          brand: token('sidebar-brand'),
          primary: token('sidebar-primary'),
          'primary-foreground': token('sidebar-primary-foreground'),
          accent: token('sidebar-accent'),
          'accent-foreground': token('sidebar-accent-foreground'),
          border: token('sidebar-border'),
          ring: token('sidebar-ring'),
        },
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
