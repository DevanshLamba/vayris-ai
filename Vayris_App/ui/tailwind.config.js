/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    'glass-strong', 'rounded-xl', 'p-4', 'p-3', 'mt-2', 'mb-2', 'mb-3', 'mb-4', 'flex', 'flex-col', 'gap-2', 'gap-3', 'gap-4', 'justify-between', 'items-start', 'items-center',
    'border', 'border-white/5', 'border-white/10', 'border-rose-500/20', 'border-rose-500/30', 'opacity-60',
    'line-through', 'text-white/50', 'text-white/40', 'text-white/30', 'text-white/80', 'text-white/90',
    'font-medium', 'text-sm', 'text-[11px]', 'text-[10px]', 'text-[15px]', 'text-[9px]',
    'uppercase', 'tracking-wider', 'tracking-widest', 'font-mono',
    'text-rose-400', 'text-amber-400', 'text-blue-400', 'text-indigo-300', 'text-indigo-400', 'text-emerald-400', 'text-rose-300', 'text-purple-400', 'text-purple-500',
    'whitespace-pre-wrap', 'bg-purple-500', 'w-1.5', 'h-1.5', 'rounded-full'
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
