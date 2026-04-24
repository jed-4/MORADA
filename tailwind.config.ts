import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: ".5625rem", /* 9px */
        md: ".375rem", /* 6px */
        sm: ".1875rem", /* 3px */
      },
      colors: {
        casva: {
          50: '#F7F4FE',
          100: '#EEE9FA',
          200: '#DDD3F5',
          300: '#C9BAEC',
          400: '#B8A6E3',
          500: '#A890D4',
          600: '#9478C0',
          700: '#7D60A8',
          800: '#614B85',
          900: '#473660',
        },
        // Flat / base colors (regular buttons)
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
          border: "hsl(var(--card-border) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
          border: "hsl(var(--popover-border) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          border: "var(--primary-border)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
          border: "var(--secondary-border)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
          border: "var(--muted-border)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          border: "var(--accent-border)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
          border: "var(--destructive-border)",
        },
        ring: "hsl(var(--ring) / <alpha-value>)",
        "border-strong": "hsl(var(--border-strong) / <alpha-value>)",
        teal: "hsl(var(--teal) / <alpha-value>)",
        "teal-light": "hsl(var(--teal-light))",
        sage: "hsl(var(--sage) / <alpha-value>)",
        "sage-light": "hsl(var(--sage-light))",
        amber: "hsl(var(--amber) / <alpha-value>)",
        "amber-light": "hsl(var(--amber-light))",
        coral: "hsl(var(--coral) / <alpha-value>)",
        "coral-light": "hsl(var(--coral-light))",
        "rose-accent": "hsl(var(--rose) / <alpha-value>)",
        "rose-light": "hsl(var(--rose-light))",
        // Status pill (soft pastel) tokens — declared on `colors` so both
        // `text-status-*` and `bg-status-*-bg` utilities are generated.
        "status-success": {
          DEFAULT: "hsl(var(--status-success-fg) / <alpha-value>)",
          bg: "hsl(var(--status-success-bg))",
        },
        "status-warning": {
          DEFAULT: "hsl(var(--status-warning-fg) / <alpha-value>)",
          bg: "hsl(var(--status-warning-bg))",
        },
        "status-info": {
          DEFAULT: "hsl(var(--status-info-fg) / <alpha-value>)",
          bg: "hsl(var(--status-info-bg))",
        },
        "status-danger": {
          DEFAULT: "hsl(var(--status-danger-fg) / <alpha-value>)",
          bg: "hsl(var(--status-danger-bg))",
        },
        "status-action": {
          DEFAULT: "hsl(var(--status-action-fg) / <alpha-value>)",
          bg: "hsl(var(--status-action-bg))",
        },
      },
      textColor: {
        // Override `text-secondary` / `text-muted` to point at the helper
        // text tokens, while preserving the `*-foreground` subkeys that
        // shadcn relies on (text-secondary-foreground, text-muted-foreground).
        secondary: {
          DEFAULT: "hsl(var(--text-secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--text-muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        chart: {
          "1": "hsl(var(--chart-1) / <alpha-value>)",
          "2": "hsl(var(--chart-2) / <alpha-value>)",
          "3": "hsl(var(--chart-3) / <alpha-value>)",
          "4": "hsl(var(--chart-4) / <alpha-value>)",
          "5": "hsl(var(--chart-5) / <alpha-value>)",
        },
        sidebar: {
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
          DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
        },
        "sidebar-primary": {
          DEFAULT: "hsl(var(--sidebar-primary) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          border: "var(--sidebar-primary-border)",
        },
        "sidebar-accent": {
          DEFAULT: "hsl(var(--sidebar-accent) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "var(--sidebar-accent-border)"
        },
        status: {
          online: "rgb(34 197 94)",
          away: "rgb(245 158 11)",
          busy: "rgb(239 68 68)",
          offline: "rgb(156 163 175)",
        },
        // Compact data-table tokens
        "table-surface": "hsl(var(--table-surface) / <alpha-value>)",
        "table-header": {
          DEFAULT: "hsl(var(--table-header-bg) / <alpha-value>)",
          foreground: "hsl(var(--table-header-fg) / <alpha-value>)",
        },
        "table-row": {
          foreground: "hsl(var(--table-row-fg) / <alpha-value>)",
        },
        // Status pill (soft pastel) tokens
        "status-success": {
          DEFAULT: "hsl(var(--status-success-fg) / <alpha-value>)",
          bg: "hsl(var(--status-success-bg))",
        },
        "status-warning": {
          DEFAULT: "hsl(var(--status-warning-fg) / <alpha-value>)",
          bg: "hsl(var(--status-warning-bg))",
        },
        "status-info": {
          DEFAULT: "hsl(var(--status-info-fg) / <alpha-value>)",
          bg: "hsl(var(--status-info-bg))",
        },
        "status-danger": {
          DEFAULT: "hsl(var(--status-danger-fg) / <alpha-value>)",
          bg: "hsl(var(--status-danger-bg))",
        },
        "status-action": {
          DEFAULT: "hsl(var(--status-action-fg) / <alpha-value>)",
          bg: "hsl(var(--status-action-bg))",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        '2xs':    ['0.5rem',    { lineHeight: '0.75rem' }],   /* 8px  — widget labels, ultra-compact metadata */
        'label':  ['0.5625rem', { lineHeight: '0.875rem' }],  /* 9px  — table column headers, uppercase section labels */
        'data':   ['0.625rem',  { lineHeight: '1rem' }],      /* 10px — compact data, line item text */
        'table':  ['0.6875rem', { lineHeight: '1.0625rem' }], /* 11px — standard table body text */
        'body-sm':['0.8125rem', { lineHeight: '1.25rem' }],   /* 13px — domain body text */
        'body-lg':['0.9375rem', { lineHeight: '1.375rem' }],  /* 15px — domain body large */
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
