import { useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { useSummary, useNiftyHistory, useSnapshots, usePF, useAdminPFAccounts, useMutualFunds } from '../hooks/useApi'
import { StatCard, Spinner, Card, PageHeader } from '../components/UI'
import { formatINR, formatPct, cn, CHART_THEME_LIGHT, CHART_THEME_DARK } from '../utils/format'
import { calculateXIRR, buildPFCashflows, buildMFCashflows } from '../utils/xirrUtils'
import { useTheme } from '../hooks/useTheme'
import { AnimatedList } from '../components/AnimatedList'

interface TooltipPayloadItem {
  name: string
  value: number
  color: string
}
interface TooltipProps {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}

const TT = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }} className="font-mono">
          {p.name}: {formatINR(p.value)}
        </div>
      ))}
    </div>
  )
}

// ── Retirement goal progress ───────────────────────────────────────────────
const RETIREMENT_RATES = [0.08, 0.10, 0.12, 0.14]
const RETIREMENT_INFLATION = 0.06
const RETIREMENT_SW_RATE = 0.04 // 4% withdrawal rule
const RETIREMENT_MONTHLY_KEY = 'retirement.targetMonthly'
const RETIREMENT_RATE_KEY = 'retirement.rate'

function RetirementProgress({ now }: { now: number }) {
  const [rate, setRate] = useState<number>(() => {
    const stored = localStorage.getItem(RETIREMENT_RATE_KEY)
    const v = stored ? parseFloat(stored) : NaN
    return RETIREMENT_RATES.includes(v) ? v : RETIREMENT_RATES[1]
  })
  const [targetMonthly, setTargetMonthly] = useState<number>(() => {
    const stored = localStorage.getItem(RETIREMENT_MONTHLY_KEY)
    const v = stored ? parseFloat(stored) : NaN
    return Number.isFinite(v) && v > 0 ? Math.round(v) : 360_000
  })
  const targetCorpus = targetMonthly > 0 ? (targetMonthly * 12) / RETIREMENT_SW_RATE : 0
  const pct = targetCorpus > 0 ? Math.min((now / targetCorpus) * 100, 100) : 0
  const remaining = Math.max(targetCorpus - now, 0)
  const currentMonthly = (now * RETIREMENT_SW_RATE) / 12
  const yearsToGo = now > 0 && targetCorpus > now
    ? Math.log(targetCorpus / now) / Math.log(1 + rate)
    : 0
  const todayMonthly = yearsToGo > 0
    ? targetMonthly / Math.pow(1 + RETIREMENT_INFLATION, yearsToGo)
    : targetMonthly

  return (
    <Card title="Retirement Goal">
      <div className="flex flex-col gap-5 pt-1">
        <div>
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">Current Net Worth</div>
              <div className="text-2xl font-bold text-foreground">{formatINR(now)}</div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">Target</div>
              <div className="text-2xl font-bold text-foreground">{formatINR(targetCorpus)}</div>
              {yearsToGo > 0 && (
                <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                  ~{yearsToGo.toFixed(1)} yrs at {(rate * 100).toFixed(0)}%
                </div>
              )}
              {targetMonthly > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {formatINR(targetMonthly)}/mo ≈ {formatINR(todayMonthly)} today @ {formatPct(RETIREMENT_INFLATION * 100)} inflation
                </div>
              )}
            </div>
          </div>
          <div className="relative h-3.5 rounded-full bg-muted overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-violet-400 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
            <div
              className="absolute inset-y-0 w-px bg-foreground/30"
              style={{ left: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground font-mono">
            <span>₹0</span>
            <span className="font-semibold text-foreground">{pct.toFixed(1)}% funded</span>
            <span>{formatINR(targetCorpus)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 border-t border-border/60 pt-4">
          {[
            { label: 'Current Value', value: formatINR(now) },
            { label: 'Current Monthly (4%)', value: formatINR(currentMonthly) },
            { label: 'Target', value: formatINR(targetCorpus) },
            { label: 'Remaining', value: formatINR(remaining) },
          ].map((c) => (
            <div key={c.label}>
              <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase mb-1">{c.label}</div>
              <div className="text-lg font-bold text-foreground">{c.value}</div>
            </div>
          ))}
          <div>
            <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase mb-1">Target Monthly (4%)</div>
            <div className="flex items-baseline gap-1 text-lg font-bold text-foreground">
              <span className="text-sm text-muted-foreground font-normal">₹</span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={targetMonthly > 0 ? (targetMonthly / 100000).toFixed(1) : ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  const next = Number.isFinite(v) && v > 0 ? Math.round(v * 100000) : 0
                  setTargetMonthly(next)
                  localStorage.setItem(RETIREMENT_MONTHLY_KEY, String(next))
                }}
                className="w-16 bg-transparent border-b border-border focus:outline-none focus:border-primary text-right font-bold tabular-nums"
              />
              <span className="text-sm text-muted-foreground font-normal">L</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Projected return</span>
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
            {RETIREMENT_RATES.map((r) => (
              <button
                key={r}
                onClick={() => { setRate(r); localStorage.setItem(RETIREMENT_RATE_KEY, String(r)) }}
                className={cn(
                  'px-3 py-1 transition-all',
                  rate === r ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {(r * 100).toFixed(0)}%
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const { data: summary, isLoading: sumLoading } = useSummary()
  const { data: nifty } = useNiftyHistory()
  const { data: snapshots } = useSnapshots()
  const { data: pfRows } = usePF()
  const { data: mfRows } = useMutualFunds()
  const { data: u1Accts } = useAdminPFAccounts('user1')
  const { data: u2Accts } = useAdminPFAccounts('user2')
  const { theme } = useTheme()
  const CT = theme === 'dark' ? CHART_THEME_DARK : CHART_THEME_LIGHT

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

  // Build portfolio chart: historical snapshots + live
  const pfData = (() => {
    const hist = (snapshots || []).map((s) => ({
      label: s.label,
      invested: s.total_invested,
      value: s.total_value,
    }))
    if (summary) {
      const today = new Date()
      const todayLabel = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
      const withoutToday = hist.filter((h) => h.label !== todayLabel)
      return [...withoutToday, { label: 'Live', invested: summary.total_invested, value: summary.total_now }]
    }
    return hist
  })()

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

      {/* Retirement progress */}
      {summary && <RetirementProgress now={summary.total_now} />}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Nifty */}
        <Card title="NIFTY 50 — Last 14 Trading Days" beam>
          {!nifty?.length ? (
            <Spinner />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={nifty} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
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
                <Tooltip
                  contentStyle={{
                    background: CT.bg,
                    border: `1px solid ${CT.border}`,
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: CT.text }}
                  itemStyle={{ color: '#6366f1' }}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#niftyGrad)"
                  dot={{ fill: '#6366f1', r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Portfolio value */}
        <Card title="Portfolio Value vs Invested" beam>
          {!pfData.length ? (
            <Spinner />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={pfData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="pfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CT.grid} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: CT.text, fontSize: 10 }} />
                <YAxis tick={{ fill: CT.text, fontSize: 11 }} tickFormatter={(v) => formatINR(v)} />
                <Tooltip content={<TT />} />
                <Legend wrapperStyle={{ color: CT.text, fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="invested"
                  name="Invested"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  fill="none"
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Current Value"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fill="url(#pfGrad)"
                  dot={{ fill: '#8b5cf6', r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </AnimatedList>
  )
}
