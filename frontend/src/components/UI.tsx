import React from 'react'
import { cn, formatINR } from '../utils/format'
import { NumberTicker } from './NumberTicker'
import { BorderBeam } from './BorderBeam'

// ── Stat Card ──────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string
  value: string
  /** When provided, the value animates from 0 using NumberTicker */
  rawValue?: number
  /** Formatter used by NumberTicker; defaults to formatINR */
  valueFormatter?: (n: number) => string
  /** Show BorderBeam moving-highlight effect */
  beam?: boolean
  delta?: string
  positive?: boolean
  accent?: 'blue' | 'green' | 'amber' | 'indigo' | 'rose' | 'violet' | 'cyan'
  subtitle?: string
}

export function StatCard({ label, value, rawValue, valueFormatter, beam, delta, positive, accent = 'blue', subtitle }: StatCardProps) {
  const accentBar = {
    blue:   'bg-sky-400',
    green:  'bg-emerald-400',
    amber:  'bg-violet-400',
    indigo: 'bg-indigo-500',
    rose:   'bg-rose-400',
    violet: 'bg-purple-500',
    cyan:   'bg-cyan-400',
  }[accent]
  return (
    <div className="group relative bg-card/70 backdrop-blur-xl border border-white/20 dark:border-indigo-900/40 rounded-xl overflow-hidden transition-all duration-200 hover:shadow-[0_8px_32px_-4px_rgba(99,102,241,0.2)] dark:hover:shadow-[0_8px_32px_-4px_rgba(99,102,241,0.3)]">
      {/* left accent bar */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-[3px]', accentBar)} />
      <div className="pl-5 pr-4 pt-4 pb-4">
        <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase mb-2.5">{label}</div>
        <div className="text-foreground text-[1.6rem] font-bold leading-none tracking-tight mb-1">
          {rawValue != null
            ? <NumberTicker value={rawValue} formatter={valueFormatter ?? formatINR} />
            : value}
        </div>
        {subtitle && <div className="text-muted-foreground text-xs mt-1">{subtitle}</div>}
        <div className={cn(
          'mt-2.5 text-[13px] font-medium min-h-[20px]',
          delta ? (positive ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400') : 'invisible',
        )}>
          {delta ? <>{positive ? '▲' : '▼'} {delta}</> : <span>&nbsp;</span>}
        </div>
      </div>
      {beam && <BorderBeam duration={6} colorFrom="var(--indigo)" />}
    </div>
  )
}

// ── Section Card ──────────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode
  className?: string
  title?: string
  /** Show BorderBeam moving-highlight effect */
  beam?: boolean
}
export function Card({ children, className, title, beam }: CardProps) {
  return (
    <div className={cn('relative bg-card/70 backdrop-blur-xl border border-white/20 dark:border-indigo-900/40 rounded-xl overflow-hidden', className)}>
      {title && (
        <div className="px-5 pt-4 pb-3 border-b border-border">
          <h3 className="text-[13px] font-semibold text-foreground tracking-wide uppercase text-muted-foreground">{title}</h3>
        </div>
      )}
      <div className="p-5">{children}</div>
      {beam && <BorderBeam duration={10} colorFrom="var(--indigo)" size={120} />}
    </div>
  )
}

// ── Loading Spinner ──────────────────────────────────────────────────────
export function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="relative w-8 h-8">
        <div className="absolute inset-0 rounded-full border-2 border-border" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[hsl(var(--primary))] animate-spin" />
      </div>
    </div>
  )
}

// ── Badge ───────────────────────────────────────────────────────────────
interface BadgeProps {
  children: React.ReactNode
  variant?: 'green' | 'red' | 'amber' | 'blue' | 'zinc'
}
export function Badge({ children, variant = 'zinc' }: BadgeProps) {
  const cls = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900',
    red:   'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-900',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900',
    blue:  'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-900',
    zinc:  'bg-muted text-muted-foreground border-border',
  }[variant]
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border', cls)}>
      {children}
    </span>
  )
}

// ── Returns cell helper ──────────────────────────────────────────────────
export function ReturnsCell({ value }: { value: number }) {
  const pos = value >= 0
  return (
    <span className={cn('font-mono font-semibold text-sm', pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
      {pos ? '+' : ''}
      {value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
    </span>
  )
}

// ── Pct cell ───────────────────────────────────────────────────────────
export function PctCell({ value }: { value: number }) {
  const pos = value >= 0
  return (
    <span className={cn('font-mono font-semibold text-sm', pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
      {pos ? '+' : ''}
      {value?.toFixed(2)}%
    </span>
  )
}

// ── Action Button ─────────────────────────────────────────────────────
interface BtnProps {
  onClick: () => void
  loading?: boolean
  children: React.ReactNode
  variant?: 'default' | 'primary'
  disabled?: boolean
}
export function Btn({ onClick, loading, children, variant = 'default', disabled }: BtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={cn(
        'px-4 py-2 rounded-lg text-sm font-semibold border transition-all flex items-center gap-2',
        variant === 'primary'
          ? 'bg-primary border-primary text-primary-foreground hover:opacity-90'
          : 'bg-card border-border text-foreground hover:bg-muted',
        (loading || disabled) && 'opacity-50 cursor-not-allowed',
      )}
    >
      {loading ? (
        <span className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin" />
      ) : null}
      {children}
    </button>
  )
}

// ── Table ─────────────────────────────────────────────────────────────
interface TableProps<T> {
  data: T[]
  columns: { key: keyof T | string; label: string; render?: (row: T, index: number) => React.ReactNode; align?: 'left' | 'right' }[]
  rowClassName?: string | ((row: T, index: number) => string | undefined)
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function Table<T extends {}>({ data, columns, rowClassName }: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map((c) => (
              <th
                key={String(c.key)}
                className={cn(
                  'py-3 px-4 text-xs font-semibold text-muted-foreground tracking-wider uppercase',
                  c.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const customClass =
              typeof rowClassName === 'function'
                ? rowClassName(row, i)
                : rowClassName;
            return (
              <tr
                key={i}
                className={cn('border-b border-border hover:bg-muted/40 transition-colors', customClass)}
              >
                {columns.map((c) => (
                  <td
                    key={String(c.key)}
                    className={cn('py-3 px-4 text-foreground', c.align === 'right' ? 'text-right font-mono' : '')}
                  >
                    {c.render ? c.render(row, i) : String((row as Record<string, unknown>)[c.key as string] ?? '')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Page header ──────────────────────────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-[1.65rem] font-bold text-foreground tracking-tight leading-none">{title}</h1>
        {subtitle && <p className="text-muted-foreground text-sm mt-1.5">{subtitle}</p>}
      </div>
      {children && <div className="flex gap-2 mt-0.5">{children}</div>}
    </div>
  )
}

// ── Tab bar ──────────────────────────────────────────────────────────
interface TabBarProps {
  tabs: { key: string; label: string }[]
  active: string
  onChange: (key: string) => void
  className?: string
}
export function TabBar({ tabs, active, onChange, className }: TabBarProps) {
  return (
    <div className={cn('flex gap-0 p-1 bg-muted rounded-lg border border-border', className)} role="tablist">
      {tabs.map(t => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
            active === t.key
              ? 'bg-card text-foreground shadow-sm border border-border'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Skeleton ─────────────────────────────────────────────────────────
interface SkeletonProps {
  className?: string
  rows?: number
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />
}
export function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="w-[3px] h-full absolute left-0 bg-border" />
      <div className="pl-5 pr-4 pt-4 pb-4 space-y-3">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-2.5 w-16" />
      </div>
    </div>
  )
}
export function SkeletonTable({ rows = 5 }: SkeletonProps) {
  return (
    <div className="space-y-2" aria-label="Loading…" role="status">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}
export function SkeletonChart({ height = 220 }: { height?: number }) {
  return (
    <div style={{ height }} className="w-full flex flex-col justify-end gap-1 px-4 pb-2" aria-label="Loading chart…" role="status">
      {[60, 80, 45, 90, 70, 55, 85, 65, 75, 50].map((h, i) => (
        <div key={i} className="skeleton rounded" style={{ height: `${h}%`, width: '8%', display: 'inline-block', marginRight: '2%' }} />
      ))}
    </div>
  )
}
