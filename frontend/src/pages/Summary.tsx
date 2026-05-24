import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { useSummary } from '../hooks/useApi'
import { StatCard, Spinner, Card, PageHeader } from '../components/UI'
import { formatINR, CHART_THEME } from '../utils/format'

const COLORS = ['#8b5cf6', '#22c55e']

export default function Summary() {
  const { data: s, isLoading } = useSummary()
  if (isLoading || !s) return <Spinner />

  const investedVsNow = [
    { name: 'Invested', value: s.total_invested },
    { name: 'Current', value: s.total_now },
  ]
  const investedVsRet = [
    { name: 'Invested', value: s.total_invested },
    { name: 'Returns', value: s.total_returns },
  ]
  const barData = [
    { name: 'Stocks', Invested: s.sto_invested, Value: s.sto_now, Returns: s.sto_returns },
    { name: 'Mutual Funds', Invested: s.mf_invested, Value: s.mf_now, Returns: s.mf_returns },
  ]

  interface SummaryPayloadItem {
    name: string
    value: number
    fill: string
  }
  interface SummaryTooltipProps {
    active?: boolean
    payload?: SummaryPayloadItem[]
  }

  const TT = ({ active, payload }: SummaryTooltipProps) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs space-y-1">
        {payload.map((p) => (
          <div key={p.name} style={{ color: p.fill }} className="font-mono">
            {p.name}: {formatINR(p.value)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Portfolio Summary" subtitle="Total overview across all assets" />

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Invested" value={formatINR(s.total_invested)} accent="blue" />
        <StatCard label="Total Value Now" value={formatINR(s.total_now)} accent="green" />
        <StatCard
          label="Total Returns"
          value={formatINR(s.total_returns)}
          delta={`${s.total_pct}%`}
          positive={s.total_returns >= 0}
          accent="amber"
        />
        <StatCard label="Appreciation" value={`${s.appreciation_x}×`} delta="vs invested" positive accent="indigo" />
      </div>

      {/* Pie charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Total Invested vs Current Value">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={investedVsNow}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                dataKey="value"
                nameKey="name"
                paddingAngle={3}
              >
                {investedVsNow.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => formatINR(v)}
                contentStyle={{
                  background: CHART_THEME.bg,
                  border: `1px solid ${CHART_THEME.border}`,
                  borderRadius: 8,
                }}
                itemStyle={{ color: CHART_THEME.text }}
                labelStyle={{ color: CHART_THEME.text }}
              />
              <Legend wrapperStyle={{ color: CHART_THEME.text, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="text-center text-emerald-400 font-semibold text-sm mt-1">
            ~{s.appreciation_x}× appreciation
          </div>
        </Card>

        <Card title="Invested vs Returns">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={investedVsRet}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                dataKey="value"
                nameKey="name"
                paddingAngle={3}
              >
                <Cell fill="#8b5cf6" />
                <Cell fill="#22c55e" />
              </Pie>
              <Tooltip
                formatter={(v: number) => formatINR(v)}
                contentStyle={{
                  background: CHART_THEME.bg,
                  border: `1px solid ${CHART_THEME.border}`,
                  borderRadius: 8,
                }}
                itemStyle={{ color: CHART_THEME.text }}
                labelStyle={{ color: CHART_THEME.text }}
              />
              <Legend wrapperStyle={{ color: CHART_THEME.text, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="text-center text-emerald-400 font-semibold text-sm mt-1">
            {s.total_pct >= 0 ? '+' : ''}
            {s.total_pct}% return
          </div>
        </Card>
      </div>

      {/* Stocks vs MF bar */}
      <Card title="Stocks vs Mutual Funds Comparison">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fill: CHART_THEME.text }} />
            <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fill: CHART_THEME.text, fontSize: 11 }} />
            <Tooltip content={<TT />} />
            <Legend wrapperStyle={{ color: CHART_THEME.text }} />
            <Bar dataKey="Invested" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Returns" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
