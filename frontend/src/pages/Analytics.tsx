import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
  LineChart,
  Line,
} from 'recharts'
import { useTimeline, useMonthly, useSnapshots, useSaveSnapshot } from '../hooks/useApi'
import { Spinner, Card, PageHeader, Btn, StatCard } from '../components/UI'
import { formatINR, CHART_THEME } from '../utils/format'
import { IconCamera } from '@tabler/icons-react'

interface ChartPayloadItem {
  name: string
  value: number
  fill?: string
  stroke?: string
}
interface ChartTooltipProps {
  active?: boolean
  payload?: ChartPayloadItem[]
  label?: string
}

const ChartTT = ({ active, payload, label }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs space-y-1">
      <div className="text-zinc-400 font-medium mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.fill || p.stroke }} className="font-mono flex justify-between gap-4">
          <span>{p.name}</span>
          <span>{formatINR(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function Analytics() {
  const { data: timeline, isLoading: tlLoading } = useTimeline()
  const { data: monthly, isLoading: moLoading } = useMonthly()
  const { data: snapshots } = useSnapshots()
  const saveSnap = useSaveSnapshot()

  // Summary stats from timeline
  const tlTotal = timeline?.reduce((a, r) => ({ inv: a.inv + r.invested, val: a.val + r.value_now }), {
    inv: 0,
    val: 0,
  })
  const tlGains = tlTotal ? tlTotal.val - tlTotal.inv : 0
  const tlPct = tlTotal?.inv ? ((tlGains / tlTotal.inv) * 100).toFixed(2) : '0'

  // Snapshot CAGR
  const cagr = (() => {
    if (!snapshots || snapshots.length < 2) return null
    const first = snapshots[0],
      last = snapshots[snapshots.length - 1]
    const years = last.year - first.year + (last.month - first.month) / 12
    if (years <= 0 || !first.total_value) return null
    return ((last.total_value / first.total_value) ** (1 / years) - 1) * 100
  })()

  return (
    <div className="space-y-6">
      <PageHeader title="Portfolio Analytics" subtitle="Investment timeline, patterns & growth">
        <Btn onClick={() => saveSnap.mutate()} loading={saveSnap.isPending} variant="primary">
          <IconCamera size={14} />
          Save Snapshot
        </Btn>
      </PageHeader>

      {/* Timeline Summary */}
      {tlTotal && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Invested" value={formatINR(tlTotal.inv)} accent="blue" />
          <StatCard label="Current Value" value={formatINR(tlTotal.val)} accent="green" />
          <StatCard
            label="Total Returns"
            value={formatINR(tlGains)}
            delta={`${tlPct}%`}
            positive={tlGains >= 0}
            accent="amber"
          />
          {cagr && (
            <StatCard label="CAGR (Snapshots)" value={`${cagr.toFixed(2)}%`} positive={cagr >= 0} accent="indigo" />
          )}
        </div>
      )}

      {/* Year-wise Investment Timeline */}
      <Card title="Year-wise Investment vs Returns (Mutual Funds)">
        {tlLoading ? (
          <Spinner />
        ) : !timeline?.length ? (
          <p className="text-zinc-500 text-sm text-center py-8">No transaction data with purchase dates found.</p>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={timeline} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fill: CHART_THEME.text }} />
              <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fill: CHART_THEME.text, fontSize: 11 }} />
              <Tooltip content={<ChartTT />} />
              <Legend wrapperStyle={{ color: CHART_THEME.text }} />
              <Bar dataKey="invested" name="Invested" fill="#f59e0b" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="gains" name="Returns" fill="#22c55e" stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Monthly Investment Pattern */}
      <Card title="Monthly Investment Patterns">
        {moLoading ? (
          <Spinner />
        ) : !monthly?.length ? (
          <p className="text-zinc-500 text-sm text-center py-8">No monthly data available.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthly} margin={{ top: 5, right: 20, left: 20, bottom: 40 }}>
                <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fill: CHART_THEME.text, fontSize: 10 }} angle={-45} textAnchor="end" />
                <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fill: CHART_THEME.text, fontSize: 11 }} />
                <Tooltip content={<ChartTT />} />
                <Bar dataKey="amount" name="Investment" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Top/Bottom months */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Top 5 Months</div>
                {[...monthly]
                  .sort((a, b) => b.amount - a.amount)
                  .slice(0, 5)
                  .map((m, i) => (
                    <div key={i} className="flex justify-between py-1.5 border-b border-zinc-800/50 text-sm">
                      <span className="text-zinc-400 font-mono">{m.month}</span>
                      <span className="text-emerald-400 font-mono">{formatINR(m.amount)}</span>
                    </div>
                  ))}
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Lowest 5 Months</div>
                {[...monthly]
                  .sort((a, b) => a.amount - b.amount)
                  .slice(0, 5)
                  .map((m, i) => (
                    <div key={i} className="flex justify-between py-1.5 border-b border-zinc-800/50 text-sm">
                      <span className="text-zinc-400 font-mono">{m.month}</span>
                      <span className="text-amber-400 font-mono">{formatINR(m.amount)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Snapshots Timeline */}
      <Card title="Portfolio Snapshots Timeline">
        {!snapshots?.length ? (
          <div className="text-center py-8">
            <p className="text-zinc-500 text-sm">No historical snapshots yet.</p>
            <p className="text-zinc-600 text-xs mt-1">
              Click "Save Snapshot" above to start tracking portfolio growth over time.
            </p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={snapshots} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: CHART_THEME.text, fontSize: 10 }} />
                <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fill: CHART_THEME.text, fontSize: 11 }} />
                <Tooltip content={<ChartTT />} />
                <Legend wrapperStyle={{ color: CHART_THEME.text }} />
                <Area
                  type="monotone"
                  dataKey="total_invested"
                  name="Invested"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  fill="none"
                />
                <Area
                  type="monotone"
                  dataKey="total_value"
                  name="Portfolio Value"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#valGrad)"
                  dot={{ fill: '#3b82f6', r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>

            {/* MF vs Stocks trend */}
            <div className="mt-4">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                MF vs Stocks Value Trend
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={snapshots} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: CHART_THEME.text, fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fill: CHART_THEME.text, fontSize: 11 }} />
                  <Tooltip content={<ChartTT />} />
                  <Legend wrapperStyle={{ color: CHART_THEME.text }} />
                  <Line
                    type="monotone"
                    dataKey="mf_value"
                    name="Mutual Funds"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="stock_value"
                    name="Stocks"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
