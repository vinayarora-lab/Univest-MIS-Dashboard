/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bloomberg: {
          bg: '#f0f4f8',
          surface: '#e8edf3',
          card: '#ffffff',
          border: '#d1dce8',
          accent: '#2563eb',
          accentHover: '#1d4ed8',
          green: '#16a34a',
          red: '#dc2626',
          blue: '#2563eb',
          purple: '#7c3aed',
          cyan: '#0891b2',
          text: '#0f172a',
          muted: '#64748b',
          subtle: '#334155',
          amber: '#d97706',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
