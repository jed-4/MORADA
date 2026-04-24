import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        "sidebar-primary": {
          DEFAULT: "hsl(var(--sidebar-primary))",
          foreground: "hsl(var(--sidebar-primary-foreground))",
        },
        "sidebar-accent": {
          DEFAULT: "hsl(var(--sidebar-accent))",
          foreground: "hsl(var(--sidebar-accent-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        "border-strong": "hsl(var(--border-strong))",
        teal: "hsl(var(--teal))",
        "teal-light": "hsl(var(--teal-light))",
        sage: "hsl(var(--sage))",
        "sage-light": "hsl(var(--sage-light))",
        amber: "hsl(var(--amber))",
        "amber-light": "hsl(var(--amber-light))",
        coral: "hsl(var(--coral))",
        "coral-light": "hsl(var(--coral-light))",
        "rose-accent": "hsl(var(--rose))",
        "rose-light": "hsl(var(--rose-light))",
        "status-success": {
          DEFAULT: "hsl(var(--status-success-fg))",
          bg: "hsl(var(--status-success-bg))",
        },
        "status-warning": {
          DEFAULT: "hsl(var(--status-warning-fg))",
          bg: "hsl(var(--status-warning-bg))",
        },
        "status-info": {
          DEFAULT: "hsl(var(--status-info-fg))",
          bg: "hsl(var(--status-info-bg))",
        },
        "status-danger": {
          DEFAULT: "hsl(var(--status-danger-fg))",
          bg: "hsl(var(--status-danger-bg))",
        },
        "status-action": {
          DEFAULT: "hsl(var(--status-action-fg))",
          bg: "hsl(var(--status-action-bg))",
        },
      },
      textColor: {
        secondary: {
          DEFAULT: "hsl(var(--text-secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--text-muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
      },
      fontSize: {
        '2xs':    ['0.5rem',    { lineHeight: '0.75rem' }],   /* 8px  — widget labels, ultra-compact metadata */
        'label':  ['0.5625rem', { lineHeight: '0.875rem' }],  /* 9px  — table column headers, uppercase section labels */
        'data':   ['0.625rem',  { lineHeight: '1rem' }],      /* 10px — compact data, line item text */
        'table':  ['0.6875rem', { lineHeight: '1.0625rem' }], /* 11px — standard table body text */
        'body-sm':['0.8125rem', { lineHeight: '1.25rem' }],   /* 13px — domain body text */
        'body-lg':['0.9375rem', { lineHeight: '1.375rem' }],  /* 15px — domain body large */
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
