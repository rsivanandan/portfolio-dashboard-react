/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        background:  'hsl(var(--background) / <alpha-value>)',
        foreground:  'hsl(var(--foreground) / <alpha-value>)',
        card:        'hsl(var(--card) / <alpha-value>)',
        'card-foreground': 'hsl(var(--card-foreground) / <alpha-value>)',
        border:      'hsl(var(--border) / <alpha-value>)',
        input:       'hsl(var(--input) / <alpha-value>)',
        ring:        'hsl(var(--ring) / <alpha-value>)',
        primary:     'hsl(var(--primary) / <alpha-value>)',
        'primary-foreground': 'hsl(var(--primary-foreground) / <alpha-value>)',
        muted:       'hsl(var(--muted) / <alpha-value>)',
        'muted-foreground': 'hsl(var(--muted-foreground) / <alpha-value>)',
        accent:      'hsl(var(--accent) / <alpha-value>)',
        success:     'hsl(var(--success) / <alpha-value>)',
        danger:      'hsl(var(--danger) / <alpha-value>)',
        warning:     'hsl(var(--warning) / <alpha-value>)',
        zinc: { 950: '#09090b' },
        sage:  { DEFAULT: '#567060', light: '#EAF0EC', dark: '#6B9E8A' },
        rust:  { DEFAULT: '#C4623A', light: '#FAEDE7' },
        gold:  { DEFAULT: '#B5862A', light: '#FBF3E2' },
        sand:  { DEFAULT: '#F7F3EE', 2: '#EDE8E0', 3: '#DDD6CA' },
        ink:   { DEFAULT: '#2C2825', 2: '#6B6560', 3: '#9E9890' },
      },
      borderRadius: {
        DEFAULT: '0.5rem',
      },
    },
  },
  plugins: [],
}
