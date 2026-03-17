/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Premium dark motorsport palette
        surface: {
          900: '#09090b',    // Pure black base
          800: '#0c0c0f',    // Primary background
          700: '#111114',    // Card background
          600: '#18181b',    // Elevated surface
          500: '#27272a',    // Borders
          400: '#3f3f46',    // Muted elements
        },
        // Electric lime - the signature accent
        electric: {
          DEFAULT: '#d4ff00',  // Primary electric lime
          muted: '#a3cc00',    // Muted version
          glow: '#e5ff4d',     // Bright glow
        },
        // Status colors
        status: {
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
          info: '#3b82f6',
        },
      },
      fontFamily: {
        sans: [
          'SF Pro Display',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      fontSize: {
        'xs': ['11px', { lineHeight: '14px', letterSpacing: '0.02em' }],
        'sm': ['13px', { lineHeight: '18px', letterSpacing: '0.01em' }],
        'base': ['15px', { lineHeight: '22px', letterSpacing: '-0.01em' }],
        'lg': ['17px', { lineHeight: '24px', letterSpacing: '-0.02em' }],
        'xl': ['21px', { lineHeight: '28px', letterSpacing: '-0.02em' }],
        '2xl': ['28px', { lineHeight: '34px', letterSpacing: '-0.03em' }],
        '3xl': ['36px', { lineHeight: '42px', letterSpacing: '-0.03em' }],
        '4xl': ['48px', { lineHeight: '52px', letterSpacing: '-0.04em' }],
      },
      borderRadius: {
        'sm': '6px',
        'DEFAULT': '10px',
        'lg': '14px',
        'xl': '18px',
        '2xl': '24px',
      },
      boxShadow: {
        'glow-sm': '0 0 20px -5px rgba(212, 255, 0, 0.15)',
        'glow': '0 0 40px -10px rgba(212, 255, 0, 0.25)',
        'glow-lg': '0 0 60px -15px rgba(212, 255, 0, 0.35)',
        'inner-glow': 'inset 0 1px 0 0 rgba(255,255,255,0.05)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(ellipse at center, var(--tw-gradient-stops))',
        'gradient-subtle': 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
