import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { useSummary, useNiftyHistory, useSnapshots } from '../hooks/useApi'
import { StatCard, Spinner, Card, PageHeader } from '../components/UI'
import { formatINR, formatPct, CHART_THEME_LIGHT, CHART_THEME_DARK } from '../utils/format'
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

export default function Dashboard() {
  const { data: summary, isLoading: sumLoading } = useSummary()
  const { data: nifty } = useNiftyHistory()
  const { data: snapshots } = useSnapshots()
  const { theme } = useTheme()
  const CT = theme === 'dark' ? CHART_THEME_DARK : CHART_THEME_LIGHT

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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            {/* Column 4: Total Returns / Overall Return (CAGR) */}
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
