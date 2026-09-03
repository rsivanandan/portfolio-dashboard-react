import { useEffect, useMemo, useRef, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useSummary, useNiftyHistory, useAssetPulse, usePF, useAdminPFAccounts, useMutualFunds, type NiftyPoint, type AssetKey, type AssetPulseEntry } from '../hooks/useApi'
import { StatCard, Spinner, Card, PageHeader } from '../components/UI'
import { formatINR, formatPct, CHART_THEME_LIGHT, CHART_THEME_DARK } from '../utils/format'
import { calculateXIRR, buildPFCashflows, buildMFCashflows } from '../utils/xirrUtils'
import { useTheme } from '../hooks/useTheme'
import { AnimatedList } from '../components/AnimatedList'

const RANK_LABEL = ['★ Lowest close in this window', '2nd lowest close in this window', '3rd lowest close in this window']

interface NiftyTooltipProps {
  active?: boolean
  payload?: { payload: NiftyPoint }[]
  label?: string
  /** The 3 cheapest closes in the window, cheapest first. */
  lowestDates?: string[]
}

const NiftyTT = ({ active, payload, label, lowestDates = [] }: NiftyTooltipProps) => {
  if (!active || !payload?.length) return null
  const pt = payload[0].payload
  const pct = pt.pct_change
  const fromHigh = pt.pct_from_high
  const dipColor = pct == null ? '' : pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
  const rank = lowestDates.indexOf(pt.date)
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg space-y-0.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono" style={{ color: '#6366f1' }}>{pt.close.toLocaleString('en-IN')}</div>
      {pct != null && (
        <div className={`font-mono font-semibold ${dipColor}`}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}% vs prev close
        </div>
      )}
      {fromHigh != null && (
        <div className="font-mono text-amber-600 dark:text-amber-400">
          {fromHigh === 0 ? 'At 30-day high' : `${fromHigh.toFixed(2)}% below 30-day high`}
        </div>
      )}
      {rank >= 0 && (
        <div className="font-mono font-semibold text-amber-500">{RANK_LABEL[rank]}</div>
      )}
    </div>
  )
}

// Bars/points closer together than a label's rendered width would overlap
// their neighbour, so the label is dropped rather than shown crowded —
// measured against the real font metrics, not guessed.
let _niftyMeasureCtx: CanvasRenderingContext2D | null = null
function niftyTextWidth(text: string): number {
  if (!_niftyMeasureCtx) _niftyMeasureCtx = document.createElement('canvas').getContext('2d')
  if (!_niftyMeasureCtx) return text.length * 7
  _niftyMeasureCtx.font = '700 11px system-ui, sans-serif'
  return _niftyMeasureCtx.measureText(text).width
}

interface NiftyDotProps { cx?: number; cy?: number; payload?: NiftyPoint; slot?: number; lowestDates?: string[] }

// Ring per rank: #1 gets a solid, full-strength ring; #2 and #3 fade out and
// go dashed so it stays obvious which one is actually the cheapest at a glance.
const RANK_RING = [
  { r: 10, opacity: 1, dash: undefined },
  { r: 9, opacity: 0.75, dash: '3 2' },
  { r: 8, opacity: 0.5, dash: '3 2' },
]

// Each day's dot is colored by that day's move (green = up, red = down) with
// the % move labelled above it when there's room — the whole point is to
// spot a dip and its size without hovering. The 3 cheapest closes in the
// window get a gold ring on top of that: for someone manually picking one
// day a month to invest, those are the candidates that matter most.
const NiftyDot = ({ cx, cy, payload, slot = 40, lowestDates = [] }: NiftyDotProps) => {
  if (cx == null || cy == null || !payload) return null
  const pct = payload.pct_change
  const color = pct == null ? '#6366f1' : pct >= 0 ? '#22c55e' : '#ef4444'
  const label = pct == null ? null : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
  const showLabel = label != null && niftyTextWidth(label) < slot - 4
  const rank = lowestDates.indexOf(payload.date)
  return (
    <g>
      {rank >= 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={RANK_RING[rank].r}
          fill="none"
          stroke="#f59e0b"
          strokeOpacity={RANK_RING[rank].opacity}
          strokeWidth={rank === 0 ? 3 : 2.5}
          strokeDasharray={RANK_RING[rank].dash}
        />
      )}
      <circle cx={cx} cy={cy} r={5} fill={color} stroke="hsl(var(--card))" strokeWidth={1.5} />
      {showLabel && (
        <text x={cx} y={cy - 13} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>
          {label}
        </text>
      )}
    </g>
  )
}

const EQUITY_ASSETS: { key: AssetKey; color: string }[] = [
  { key: 'large', color: '#6366f1' },
  { key: 'mid', color: '#f59e0b' },
  { key: 'small', color: '#22c55e' },
]
const COMMODITY_ASSETS: { key: AssetKey; color: string }[] = [
  { key: 'gold', color: '#eab308' },
  { key: 'silver', color: '#94a3b8' },
  { key: 'oil', color: '#78716c' },
]

// "% below an all-time high" answers "did this just make news" — it doesn't
// say whether the asset is priced rich or cheap right now (a stale multi-
// year peak, or one it only just broke through, tells you nothing about
// today's valuation). Deviation from the trailing 200-day average is the
// standard "extended vs its own recent trend" read: a large positive number
// means it has run up fast relative to where it's been trading; a large
// negative number means it's lagging its own trend. Color/severity is by
// MAGNITUDE only (not direction) — running far below trend isn't inherently
// "bad", it can just as easily read as a value opportunity, so the headline
// text carries the direction and the tier just flags "this one's notable".
function TrendTile({ color, seg }: { color: string; seg: AssetPulseEntry }) {
  const dev = seg.pct_vs_200dma ?? 0
  const absDev = Math.abs(dev)
  const tier = absDev >= 10 ? 'rose' : absDev >= 3 ? 'amber' : 'emerald'
  const boxClasses = {
    rose: 'bg-rose-50 border-rose-200 dark:bg-rose-950 dark:border-rose-900',
    amber: 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-900',
    emerald: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-900',
  }[tier]
  const textClasses = {
    rose: 'text-rose-700 dark:text-rose-400',
    amber: 'text-amber-700 dark:text-amber-400',
    emerald: 'text-emerald-700 dark:text-emerald-400',
  }[tier]
  const barClasses = { rose: 'bg-rose-500', amber: 'bg-amber-500', emerald: 'bg-emerald-500' }[tier]
  const trendText =
    absDev < 3 ? 'Near its own trend' : dev > 0 ? (absDev >= 10 ? 'Well above trend' : 'Running above trend') : absDev >= 10 ? 'Well below trend' : 'Running below trend'
  // A centered bar: the 200-day average IS the center tick, and the fill
  // grows right (above trend) or left (below trend) from it — ±20% maps to
  // the bar's full width either side.
  const fillPct = Math.max(0, Math.min(50, absDev * 2.5))
  const monthPct = seg.pct_month
  const ytdPct = seg.pct_ytd
  const signColor = (v: number) => (v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')
  return (
    <div className={`rounded-lg border p-3 ${boxClasses}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        {seg.label}
      </div>
      <div className={`text-base font-mono font-bold ${textClasses}`}>
        {dev >= 0 ? '+' : ''}{dev.toFixed(1)}% vs 200-day trend
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{trendText}</div>
      <div className="relative h-1.5 rounded-full bg-black/10 dark:bg-white/10 mt-2 overflow-hidden">
        <div className="absolute inset-y-0 left-1/2 w-px bg-black/30 dark:bg-white/30" />
        <div
          className={`absolute inset-y-0 rounded-full ${barClasses}`}
          style={dev >= 0 ? { left: '50%', width: `${fillPct}%` } : { right: '50%', width: `${fillPct}%` }}
        />
      </div>
      {(monthPct != null || ytdPct != null) && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2 pt-2 border-t border-black/10 dark:border-white/10">
          {monthPct != null && (
            <span>1M: <span className={`font-mono font-semibold ${signColor(monthPct)}`}>{monthPct >= 0 ? '+' : ''}{monthPct.toFixed(1)}%</span></span>
          )}
          {ytdPct != null && (
            <span>YTD: <span className={`font-mono font-semibold ${signColor(ytdPct)}`}>{ytdPct >= 0 ? '+' : ''}{ytdPct.toFixed(1)}%</span></span>
          )}
        </div>
      )}
    </div>
  )
}

// Tracks the chart's rendered width so NiftyDot knows how much horizontal
// room each point actually has (varies with the 1-col/2-col dashboard layout
// and the viewport) — a fixed guess would crowd labels on narrow screens.
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

export default function Dashboard() {
  const { data: summary, isLoading: sumLoading } = useSummary()
  const { data: nifty } = useNiftyHistory()
  const { data: assetPulse } = useAssetPulse()
  const { data: pfRows } = usePF()
  const { data: mfRows } = useMutualFunds()
  const { data: u1Accts } = useAdminPFAccounts('user1')
  const { data: u2Accts } = useAdminPFAccounts('user2')
  const { theme } = useTheme()
  const CT = theme === 'dark' ? CHART_THEME_DARK : CHART_THEME_LIGHT
  const [niftyRef, niftyWidth] = useElementWidth<HTMLDivElement>()
  const niftySlot = nifty?.length ? niftyWidth / nifty.length : 40
  // The 3 cheapest closes in the trailing window, cheapest first — for
  // someone manually picking one day a month to invest, these are the
  // candidates that matter (in case the actual bottom is already past).
  const lowestNiftyDates = useMemo(
    () => [...(nifty ?? [])].sort((a, b) => a.close - b.close).slice(0, 3).map((p) => p.date),
    [nifty],
  )

  const pfOpenings = useMemo(
    () => [...(u1Accts || []), ...(u2Accts || [])],
    [u1Accts, u2Accts],
  )

  const pfXirr = useMemo(
    () => calculateXIRR(buildPFCashflows(pfRows || [], pfOpenings)),
    [pfRows, pfOpenings],
  )
  const pfXirrPct = pfXirr != null ? pfXirr * 100 : null

  const mfXirr = useMemo(
    () => calculateXIRR(buildMFCashflows(mfRows || [])),
    [mfRows],
  )
  const mfXirrPct = mfXirr != null ? mfXirr * 100 : null

  return (
    <AnimatedList delay={150} className="space-y-6">
      <PageHeader title="Portfolio Dashboard" subtitle="Personal investment tracker — Stocks & Mutual Funds">
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-400 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </PageHeader>

      {/* KPI cards - reordered in columns */}
      {sumLoading ? (
        <Spinner />
      ) : (
        summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {/* Column 1: Total Invested / Current Value */}
            <div className="flex flex-col gap-4">
              <StatCard label="Total Invested" value={formatINR(summary.total_invested)} rawValue={summary.total_invested} accent="blue" />
              <StatCard
                label="Current Value"
                value={formatINR(summary.total_now)}
                rawValue={summary.total_now}
                delta={formatPct(summary.total_pct)}
                positive={summary.total_pct >= 0}
                accent="green"
                beam
              />
            </div>
            {/* Column 2: MF Invested / MF Value */}
            <div className="flex flex-col gap-4">
              <StatCard label="MF Invested" value={formatINR(summary.mf_invested)} rawValue={summary.mf_invested} accent="blue" />
              <StatCard
                label="MF Value"
                value={formatINR(summary.mf_now)}
                rawValue={summary.mf_now}
                delta={formatPct(summary.mf_pct)}
                positive={summary.mf_pct >= 0}
                accent="green"
                valueSuffix={mfXirrPct != null ? `XIRR ${formatPct(mfXirrPct)}` : undefined}
              />
            </div>
            {/* Column 3: Stocks Invested / Stocks Value */}
            <div className="flex flex-col gap-4">
              <StatCard label="Stocks Invested" value={formatINR(summary.sto_invested)} rawValue={summary.sto_invested} accent="blue" />
              <StatCard
                label="Stocks Value"
                value={formatINR(summary.sto_now)}
                rawValue={summary.sto_now}
                delta={formatPct(summary.sto_pct)}
                positive={summary.sto_pct >= 0}
                accent="amber"
              />
            </div>
            {/* Column 4: PF Invested / PF Value */}
            <div className="flex flex-col gap-4">
              <StatCard label="PF Invested" value={formatINR(summary.pf_invested)} rawValue={summary.pf_invested} accent="blue" />
              <StatCard
                label="PF Value"
                value={formatINR(summary.pf_now)}
                rawValue={summary.pf_now}
                delta={formatPct(summary.pf_pct)}
                positive={summary.pf_pct >= 0}
                accent="violet"
                valueSuffix={pfXirrPct != null ? `XIRR ${formatPct(pfXirrPct)}` : undefined}
              />
            </div>
            {/* Column 5: Total Returns / Overall Return (CAGR) */}
            <div className="flex flex-col gap-4">
              <StatCard
                label="Overall Return"
                value={formatPct(summary.total_pct)}
                rawValue={summary.total_pct}
                valueFormatter={formatPct}
                positive={summary.total_pct >= 0}
                accent="indigo"
                beam
              />
              <StatCard
                label="Total Returns"
                value={formatINR(summary.total_returns)}
                rawValue={summary.total_returns}
                delta={`${summary.appreciation_x}× appreciation`}
                positive={summary.total_returns >= 0}
                accent="amber"
              />
            </div>
          </div>
        )
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Nifty */}
        <Card title="NIFTY 50 — Last 30 Trading Days" beam>
          {!nifty?.length ? (
            <Spinner />
          ) : (
            <div ref={niftyRef}>
              {(() => {
                const fromHigh = nifty[nifty.length - 1]?.pct_from_high
                if (fromHigh == null) return null
                // Below -5% is a real drawdown worth acting on; -2 to -5% is
                // a shallow wobble; anything else is effectively at the top.
                const tier = fromHigh <= -5 ? 'rose' : fromHigh <= -2 ? 'amber' : 'emerald'
                const tierClasses = {
                  rose: 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950 dark:border-rose-900 dark:text-rose-400',
                  amber: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-400',
                  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-400',
                }[tier]
                return (
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold font-mono mb-2 ${tierClasses}`}>
                    {fromHigh === 0 ? 'At 30-day high' : `${fromHigh.toFixed(1)}% below 30-day high`}
                  </div>
                )
              })()}
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={nifty} margin={{ top: 32, right: 20, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="niftyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CT.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: CT.text, fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: CT.text, fontSize: 11 }}
                    tickFormatter={(v) => v.toLocaleString('en-IN')}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip content={<NiftyTT lowestDates={lowestNiftyDates} />} />
                  <Area
                    type="monotone"
                    dataKey="close"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#niftyGrad)"
                    dot={<NiftyDot slot={niftySlot} lowestDates={lowestNiftyDates} />}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-1">
                Dot color marks each day's move — red is a dip, green a gain. Gold rings mark the 3 cheapest
                closes in this window (solid = cheapest, fading = 2nd/3rd) — candidates if you're timing a manual SIP.
              </p>
            </div>
          )}
        </Card>

        {/* Market pulse: equity segments + commodities */}
        <Card title="Market Pulse" beam>
          {!assetPulse || Object.keys(assetPulse).length === 0 ? (
            <Spinner />
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Equity Segments
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {EQUITY_ASSETS.map(({ key, color }) => {
                    const seg = assetPulse[key]
                    return seg ? <TrendTile key={key} color={color} seg={seg} /> : null
                  })}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Commodities
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {COMMODITY_ASSETS.map(({ key, color }) => {
                    const seg = assetPulse[key]
                    return seg ? <TrendTile key={key} color={color} seg={seg} /> : null
                  })}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AnimatedList>
  )
}
