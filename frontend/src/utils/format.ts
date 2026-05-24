export function formatINR(value: number | null | undefined): string {
  if (value == null) return '₹0'
  if (Math.abs(value) >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`
  if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(2)}L`
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
}

export function formatINRFull(value: number | null | undefined): string {
  if (value == null) return '₹0'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value)
}

export function formatPct(value: number | null | undefined): string {
  if (value == null) return '0%'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export const CHART_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#38bdf8', // sky
  '#818cf8', // periwinkle
  '#a78bfa', // purple
  '#22d3ee', // cyan
  '#c084fc', // purple-light
  '#67e8f9', // cyan-light
  '#4f46e5', // indigo-dark
  '#7c3aed', // violet-dark
  '#06b6d4', // cyan-base
  '#ddd6fe', // violet-200
]

export const CHART_THEME = {
  bg: '#0c0d1a',
  paper: '#0c0d1a',
  grid: '#21244a',
  text: '#7e88b8',
  border: '#21244a',
}

export const CHART_THEME_DARK = {
  bg: '#0c0d1a',
  paper: '#0c0d1a',
  grid: '#21244a',
  text: '#7e88b8',
  border: '#21244a',
}

export const CHART_THEME_LIGHT = {
  bg: 'rgba(255,255,255,0.55)',
  paper: 'rgba(255,255,255,0.55)',
  grid: '#cdd3f0',
  text: '#6b7299',
  border: '#cdd3f0',
}
