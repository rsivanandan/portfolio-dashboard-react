import { useMemo, useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, LineChart, Line, ComposedChart, LabelList,
} from 'recharts'
import { useSummary, useTimeline, useMonthly, useSnapshots, useSaveSnapshot, useMutualFunds } from '../hooks/useApi'
import { StatCard, Spinner, Card, PageHeader, Btn, TabBar } from '../components/UI'
import { XIRRCard } from '../components/XIRRCard'
import { calculateXIRR } from '../utils/xirrUtils'
import { formatINR, CHART_THEME_LIGHT, CHART_THEME_DARK } from '../utils/format'
import { useTheme } from '../hooks/useTheme'
import { IconCamera, IconChartLine, IconFileText } from '@tabler/icons-react'
import AIBriefing from '../components/AIBriefing'
import InsightsPanel from '../components/InsightsPanel'
import { RebalanceCard, TaxCard, RiskCard } from '../components/AllocationCards'
import RetirementReadinessAI from '../components/RetirementReadinessAI'
import HoldingNews from '../components/HoldingNews'
import AskAssistant from '../components/AskAssistant'
import { ScenarioModal, ReportModal } from '../components/AITools'

const PIE_COLORS = ['#8b5cf6', '#22c55e']

interface TTPayload { name: string; value: number; fill?: string; stroke?: string }
interface TTProps { active?: boolean; payload?: TTPayload[]; label?: string }

const ChartTT = ({ active, payload, label }: TTProps) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs space-y-1 shadow-lg">
      {label && <div className="text-muted-foreground font-medium mb-1">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.fill || p.stroke || 'inherit' }} className="font-mono flex justify-between gap-4">
          <span>{p.name}</span>
          <span>{formatINR(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

interface BarLabelProps { x?: number; y?: number; width?: number; height?: number; value?: number }

// Bars are ~28px wide, so a full "₹4,00,000" will not fit — these labels use
// a short form (₹4.0L, ₹44K) and the exact figure stays in the tooltip.
function compactINR(v: number): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(1)}Cr`
  if (abs >= 1000000) return `${sign}₹${Math.round(abs / 100000)}L`
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1)}L`
  return `${sign}₹${Math.round(abs / 1000)}K`
}

// Measures against the bar's own SVG font metrics (not a guess) so the label
// only renders when it will actually fit horizontally at this font size.
let _measureCtx: CanvasRenderingContext2D | null = null
function textWidth(text: string): number {
  if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d')
  if (!_measureCtx) return text.length * 6
  _measureCtx.font = '600 8px system-ui, sans-serif'
  return _measureCtx.measureText(text).width
}

// Value label drawn horizontally inside its bar, in white. A bar too short
// to hold a line of text falls back to a blue label just above it instead
// (white on the card background would be invisible in light mode); a bar
// narrower than the text renders nothing rather than an overlapping smear.
const MonthBarLabel = ({ x = 0, y = 0, width = 0, height = 0, value = 0 }: BarLabelProps) => {
  const text = compactINR(value)
  if (textWidth(text) > width - 2) return null
  const inside = height >= 16
  return (
    <text
      x={x + width / 2}
      y={inside ? y + 11 : y - 4}
      textAnchor="middle"
      fill={inside ? '#ffffff' : '#3b82f6'}
      fontSize={8}
      fontWeight={600}
    >
      {text}
    </text>
  )
}

type InsightTab = 'overview' | 'timeline' | 'snapshots' | 'ai'

export default function Insights() {
  const [tab, setTab] = useState<InsightTab>('overview')
  const [showScenario, setShowScenario] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const { theme } = useTheme()
  const CT = theme === 'dark' ? CHART_THEME_DARK : CHART_THEME_LIGHT

  const { data: s, isLoading: sumLoading } = useSummary()
  const { data: timeline, isLoading: tlLoading } = useTimeline()
  const { data: monthly, isLoading: moLoading } = useMonthly()
  const { data: snapshots } = useSnapshots()
  const { data: allMF } = useMutualFunds()
  const saveSnap = useSaveSnapshot()

  const xirrValue = (() => {
    const data = allMF || []
    const totalNow = data.reduce((a, f) => a + (f.Value_now || 0), 0)
    const flows: { amount: number; date: string }[] = []
    data.forEach((mf) => {
      if (mf.Value_at_cost && mf.Purchase_Date) flows.push({ amount: -Math.abs(mf.Value_at_cost), date: mf.Purchase_Date })
    })
    if (totalNow > 0) flows.push({ amount: totalNow, date: new Date().toISOString().slice(0, 10) })
    return flows.length > 1 ? calculateXIRR(flows) : null
  })()

  // Running total of invested amount across years — read straight off the
  // chart instead of adding the bars up by eye.
  const timelineCum = useMemo(() => {
    let run = 0
    return (timeline ?? []).map((t) => {
      run += t.invested || 0
      return { ...t, cumulative: Math.round(run * 100) / 100 }
    })
  }, [timeline])

  const cagr = (() => {
    if (!snapshots || snapshots.length < 2) return null
    const first = snapshots[0], last = snapshots[snapshots.length - 1]
    const years = last.year - first.year + (last.month - first.month) / 12
    if (years <= 0 || !first.total_value) return null
    return ((last.total_value / first.total_value) ** (1 / years) - 1) * 100
  })()

  return (
    <div className="space-y-6">
      <PageHeader title="Insights" subtitle="Portfolio overview, timeline, growth & AI">
        {tab === 'snapshots' && (
          <Btn onClick={() => saveSnap.mutate()} loading={saveSnap.isPending} variant="primary">
            <IconCamera size={14} />
            Save Snapshot
          </Btn>
        )}
        {tab === 'ai' && (
          <>
            <Btn onClick={() => setShowScenario(true)}>
              <IconChartLine size={14} />
              Scenario
            </Btn>
            <Btn onClick={() => setShowReport(true)}>
              <IconFileText size={14} />
              Report
            </Btn>
          </>
        )}
      </PageHeader>

      <TabBar
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'timeline', label: 'Timeline' },
          { key: 'snapshots', label: 'Snapshots' },
          { key: 'ai', label: 'AI' },
        ]}
        active={tab}
        onChange={(k) => setTab(k as InsightTab)}
        className="w-fit"
      />

      {/* ── Overview ──────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <>
          {sumLoading || !s ? <Spinner /> : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Invested" value={formatINR(s.total_invested)} accent="blue" />
                <StatCard label="Total Value" value={formatINR(s.total_now)} accent="green" />
                <StatCard label="Total Returns" value={formatINR(s.total_returns)} delta={`${s.total_pct}%`} positive={s.total_returns >= 0} accent="amber" />
                <StatCard label="Appreciation" value={`${s.appreciation_x}×`} delta="vs invested" positive accent="indigo" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title="Invested vs Current Value">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={[{ name: 'Invested', value: s.total_invested }, { name: 'Current', value: s.total_now }]}
                        cx="50%" cy="50%" innerRadius={70} outerRadius={110} dataKey="value" paddingAngle={3}
                      >
                        {PIE_COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatINR(v)} contentStyle={{ background: CT.bg, border: `1px solid ${CT.border}`, borderRadius: 8 }} itemStyle={{ color: CT.text }} labelStyle={{ color: CT.text }} />
                      <Legend wrapperStyle={{ color: CT.text, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="text-center text-emerald-600 dark:text-emerald-400 font-semibold text-sm mt-1">~{s.appreciation_x}× appreciation</div>
                </Card>

                <Card title="Invested vs Returns">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={[{ name: 'Invested', value: s.total_invested }, { name: 'Returns', value: s.total_returns }]}
                        cx="50%" cy="50%" innerRadius={70} outerRadius={110} dataKey="value" paddingAngle={3}
                      >
                        <Cell fill="#8b5cf6" />
                        <Cell fill="#22c55e" />
                      </Pie>
                      <Tooltip formatter={(v: number) => formatINR(v)} contentStyle={{ background: CT.bg, border: `1px solid ${CT.border}`, borderRadius: 8 }} itemStyle={{ color: CT.text }} labelStyle={{ color: CT.text }} />
                      <Legend wrapperStyle={{ color: CT.text, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="text-center text-emerald-600 dark:text-emerald-400 font-semibold text-sm mt-1">
                    {s.total_pct >= 0 ? '+' : ''}{s.total_pct}% return
                  </div>
                </Card>
              </div>

              <Card title="Stocks vs Mutual Funds vs PF">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={[
                      { name: 'Stocks', Invested: s.sto_invested, Value: s.sto_now, Returns: s.sto_returns },
                      { name: 'Mutual Funds', Invested: s.mf_invested, Value: s.mf_now, Returns: s.mf_returns },
                      { name: 'PF', Invested: s.pf_invested, Value: s.pf_now, Returns: s.pf_returns },
                    ]}
                    margin={{ top: 5, right: 20, left: 60, bottom: 5 }}
                  >
                    <CartesianGrid stroke={CT.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fill: CT.text }} />
                    <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fill: CT.text, fontSize: 11 }} />
                    <Tooltip content={<ChartTT />} />
                    <Legend wrapperStyle={{ color: CT.text }} />
                    <Bar dataKey="Invested" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Returns" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </>
          )}
        </>
      )}

      {/* ── Timeline ──────────────────────────────────────────────────────── */}
      {tab === 'timeline' && (
        <>
          <Card title="Year-wise Investment vs Returns (Mutual Funds)">
            {tlLoading ? <Spinner /> : !timeline?.length ? (
              <p className="text-muted-foreground text-sm text-center py-8">No transaction data with purchase dates found.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={380}>
                  <ComposedChart data={timelineCum} margin={{ top: 28, right: 70, left: 60, bottom: 5 }}>
                    <CartesianGrid stroke={CT.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="year" tick={{ fill: CT.text }} />
                    <YAxis yAxisId="left" tickFormatter={(v) => formatINR(v)} tick={{ fill: CT.text, fontSize: 11 }} />
                    {/* Cumulative runs an order of magnitude above the per-year
                        bars, so it needs its own scale or the bars flatten. */}
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => formatINR(v)} tick={{ fill: '#8b5cf6', fontSize: 11 }} />
                    <Tooltip content={<ChartTT />} />
                    <Legend wrapperStyle={{ color: CT.text }} />
                    <Bar yAxisId="left" dataKey="invested" name="Invested" fill="#f59e0b" stackId="a" />
                    <Bar yAxisId="left" dataKey="gains" name="Returns" fill="#22c55e" stackId="a" radius={[4, 4, 0, 0]} />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="cumulative"
                      name="Cumulative Invested"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      strokeDasharray="5 3"
                      dot={{ r: 3, fill: '#8b5cf6', stroke: '#8b5cf6' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>

                {/* The cumulative line crosses the bars, so its values are
                    listed here rather than as labels sitting on top of them. */}
                <div className="mt-4">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Cumulative Invested by Year
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
                    {timelineCum.map((t) => (
                      <div key={t.year} className="rounded-lg border border-border bg-muted/40 px-2 py-2 text-center">
                        <div className="text-[11px] text-muted-foreground font-mono">{t.year}</div>
                        <div className="text-[13px] font-mono font-semibold text-violet-600 dark:text-violet-400">
                          {formatINR(t.cumulative)}
                        </div>
                        <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                          +{formatINR(t.invested)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Running total of purchase cost (amber = added that year). Covers units still held today, so it
                    tracks the invested bars rather than every contribution ever made.
                  </p>
                </div>
              </>
            )}
          </Card>

          <Card title="Monthly Investment Patterns">
            {moLoading ? <Spinner /> : !monthly?.length ? (
              <p className="text-muted-foreground text-sm text-center py-8">No monthly data available.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={monthly} margin={{ top: 16, right: 20, left: 60, bottom: 40 }}>
                    <CartesianGrid stroke={CT.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fill: CT.text, fontSize: 10 }} angle={-45} textAnchor="end" />
                    <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fill: CT.text, fontSize: 11 }} />
                    <Tooltip content={<ChartTT />} />
                    <Bar dataKey="amount" name="Investment" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="amount" content={<MonthBarLabel />} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top 5 Months</div>
                    {[...monthly].sort((a, b) => b.amount - a.amount).slice(0, 5).map((m, i) => (
                      <div key={i} className="flex justify-between py-1.5 border-b border-border text-sm">
                        <span className="text-muted-foreground font-mono">{m.month}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono">{formatINR(m.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Lowest 5 Months</div>
                    {[...monthly].sort((a, b) => a.amount - b.amount).slice(0, 5).map((m, i) => (
                      <div key={i} className="flex justify-between py-1.5 border-b border-border text-sm">
                        <span className="text-muted-foreground font-mono">{m.month}</span>
                        <span className="text-amber-600 dark:text-amber-400 font-mono">{formatINR(m.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {/* ── Snapshots ─────────────────────────────────────────────────────── */}
      {tab === 'snapshots' && (
        <>
          {(cagr != null || xirrValue != null) && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {cagr != null && (
                <StatCard label="Portfolio Growth /yr" subtitle="Incl. fresh contributions — not a return" value={`${cagr.toFixed(2)}%`} positive={cagr >= 0} accent="indigo" />
              )}
              {xirrValue != null && (
                <XIRRCard value={xirrValue} label="XIRR (All MF)" accent="green" />
              )}
              {(() => {
                if (!snapshots || snapshots.length < 2) return null
                // Best month: largest month-over-month gain in value
                let bestGain = -Infinity, worstGain = Infinity
                let bestLabel = '', worstLabel = ''
                for (let i = 1; i < snapshots.length; i++) {
                  const delta = snapshots[i].total_value - snapshots[i - 1].total_value
                  if (delta > bestGain) { bestGain = delta; bestLabel = snapshots[i].label }
                  if (delta < worstGain) { worstGain = delta; worstLabel = snapshots[i].label }
                }
                return (
                  <>
                    <StatCard
                      label="Best Month"
                      value={formatINR(bestGain)}
                      subtitle={bestLabel}
                      positive
                      accent="green"
                    />
                    <StatCard
                      label="Worst Month"
                      value={formatINR(worstGain)}
                      subtitle={worstLabel}
                      positive={worstGain >= 0}
                      accent="rose"
                    />
                  </>
                )
              })()}
            </div>
          )}

          <Card title="Portfolio Snapshots Timeline">
            {!snapshots?.length ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">No historical snapshots yet.</p>
                <p className="text-muted-foreground/60 text-xs mt-1">Click "Save Snapshot" above to start tracking growth over time.</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={snapshots} margin={{ top: 10, right: 20, left: 60, bottom: 5 }}>
                    <defs>
                      <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={CT.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: CT.text, fontSize: 10 }} />
                    <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fill: CT.text, fontSize: 11 }} />
                    <Tooltip content={<ChartTT />} />
                    <Legend wrapperStyle={{ color: CT.text }} />
                    <Area type="monotone" dataKey="total_invested" name="Invested" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 2" fill="none" />
                    <Area type="monotone" dataKey="total_value" name="Portfolio Value" stroke="#3b82f6" strokeWidth={2} fill="url(#valGrad)" dot={{ fill: '#3b82f6', r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>

                {/* Rolling gain % line */}
                <div className="mt-6">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Rolling Return %</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart
                      data={snapshots.map(s => ({
                        label: s.label,
                        gain_pct: s.total_invested > 0 ? parseFloat(((s.total_value - s.total_invested) / s.total_invested * 100).toFixed(2)) : 0,
                      }))}
                      margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid stroke={CT.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fill: CT.text, fontSize: 10 }} />
                      <YAxis tick={{ fill: CT.text, fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        formatter={(v: number) => [`${v}%`, 'Return']}
                        contentStyle={{ background: CT.bg, border: `1px solid ${CT.border}`, borderRadius: 8 }}
                        itemStyle={{ color: '#a78bfa' }}
                        labelStyle={{ color: CT.text }}
                      />
                      <Line type="monotone" dataKey="gain_pct" name="Return %" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-6">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">MF vs Stocks vs PF Value Trend</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={snapshots} margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                      <CartesianGrid stroke={CT.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fill: CT.text, fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fill: CT.text, fontSize: 11 }} />
                      <Tooltip content={<ChartTT />} />
                      <Legend wrapperStyle={{ color: CT.text }} />
                      <Line type="monotone" dataKey="mf_value" name="Mutual Funds" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="stock_value" name="Stocks" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="pf_value" name="PF" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </Card>

          {/* Returns history table */}
          {snapshots && snapshots.length > 0 && (
            <Card title="Snapshot History">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {['Date', 'Invested', 'Value', 'Returns', 'Return %', 'MF Value', 'Stocks Value', 'PF Value'].map(h => (
                        <th key={h} className="py-2.5 px-4 text-xs font-semibold text-muted-foreground tracking-wider uppercase text-right first:text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...snapshots].reverse().map((s, i) => {
                      const ret = s.total_value - s.total_invested
                      const pct = s.total_invested > 0 ? (ret / s.total_invested) * 100 : 0
                      const pos = ret >= 0
                      return (
                        <tr key={i} className="border-b border-border hover:bg-muted/40 transition-colors">
                          <td className="py-2.5 px-4 font-mono text-foreground">{s.label}</td>
                          <td className="py-2.5 px-4 font-mono text-right text-muted-foreground">{formatINR(s.total_invested)}</td>
                          <td className="py-2.5 px-4 font-mono text-right text-foreground">{formatINR(s.total_value)}</td>
                          <td className={`py-2.5 px-4 font-mono text-right font-semibold ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {pos ? '+' : ''}{formatINR(ret)}
                          </td>
                          <td className={`py-2.5 px-4 font-mono text-right font-semibold ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {pos ? '+' : ''}{pct.toFixed(2)}%
                          </td>
                          <td className="py-2.5 px-4 font-mono text-right text-muted-foreground">{formatINR(s.mf_value)}</td>
                          <td className="py-2.5 px-4 font-mono text-right text-muted-foreground">{formatINR(s.stock_value)}</td>
                          <td className="py-2.5 px-4 font-mono text-right text-muted-foreground">{s.pf_value != null ? formatINR(s.pf_value) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* ── AI ────────────────────────────────────────────────────────────── */}
      {tab === 'ai' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AIBriefing />
            <InsightsPanel />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <RebalanceCard />
            <TaxCard />
            <RiskCard />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RetirementReadinessAI />
            <HoldingNews />
          </div>

          <AskAssistant />

          {showScenario && <ScenarioModal onClose={() => setShowScenario(false)} />}
          {showReport && <ReportModal onClose={() => setShowReport(false)} />}
        </>
      )}
    </div>
  )
}
