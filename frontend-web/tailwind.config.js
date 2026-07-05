/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]', '[data-theme="midnight"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f7f8fb', 100: '#eef0f6', 200: '#dde1eb',
          300: '#c1c7d6', 400: '#8c93a6', 500: '#5b6378',
          600: '#3d4458', 700: '#262b3a', 800: '#181c28', 900: '#0f1218',
        },
        accent: {
          DEFAULT: '#7c5cff',
          50: '#f3efff', 100: '#e6dcff', 300: '#b9a3ff',
          500: '#7c5cff', 600: '#6240ee', 700: '#4a2bd1',
        },
        success: '#10b981',
        warn:    '#f59e0b',
        danger:  '#ef4444',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15,18,24,.04), 0 6px 24px rgba(15,18,24,.06)',
        glow: '0 0 0 1px rgba(124,92,255,.2), 0 8px 32px rgba(124,92,255,.18)',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        breathe: { '0%,100%': { opacity: 0.55, transform: 'scale(1)' }, '50%': { opacity: 1, transform: 'scale(1.08)' } },
        rise: { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
      },
      animation: {
        shimmer: 'shimmer 2.4s linear infinite',
        breathe: 'breathe 1.6s ease-in-out infinite',
        rise: 'rise .25s ease-out both',
      },
    },
  },
  plugins: [],
}
