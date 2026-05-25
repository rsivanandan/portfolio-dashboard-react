import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useStocks, useStocksUser1, useStocksUser2 } from '../hooks/useApi'
import { StatCard, Spinner, Card, PageHeader, Table, ReturnsCell, PctCell } from '../components/UI'
import { formatINR, CHART_THEME } from '../utils/format'
import type { Stock } from '../hooks/useApi'
import { IconSearch } from '@tabler/icons-react'
import { getStoredUsers } from '../hooks/useUsers'

type Tab = 'all' | 'user1' | 'user2'

export default function Stocks() {
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const users = getStoredUsers()

  const { data: allStocks, isLoading: allL } = useStocks()
  const { data: user1Stocks, isLoading: u1L } = useStocksUser1()
  const { data: user2Stocks, isLoading: u2L } = useStocksUser2()

  const activeData = tab === 'all' ? allStocks : tab === 'user1' ? user1Stocks : user2Stocks
  const isLoading = tab === 'all' ? allL : tab === 'user1' ? u1L : u2L

  const data = activeData || []
  const filtered = data.filter((s) => s.Ticker.toLowerCase().includes(search.toLowerCase()))

  const totalInvested = data.reduce((a, s) => a + (s.Value_at_cost || 0), 0)
  const totalNow = data.reduce((a, s) => a + (s.Value_now || 0), 0)
  const totalReturns = totalNow - totalInvested
  const totalPct = totalInvested ? (totalReturns / totalInvested) * 100 : 0


  // Top gainers/losers for chart
  const sorted = [...data].sort((a, b) => b.Returns_pct - a.Returns_pct)
  const chartData = sorted.slice(0, 15).map((s) => ({
    name: s.Ticker,
    returns: parseFloat(s.Returns_pct.toFixed(2)),
    fill: s.Returns_pct >= 0 ? '#22c55e' : '#f43f5e',
  }))

  return (
    <div className="space-y-6">
      <PageHeader title="Stocks & Smallcase" subtitle={`${data.length} holdings`} />

      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-zinc-800 pb-0">
        {([
          { key: 'all' as Tab, label: 'All Stocks' },
          { key: 'user1' as Tab, label: users[0]?.name ?? 'User 1' },
          { key: 'user2' as Tab, label: users[1]?.name ?? 'User 2' },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-all -mb-px ${
              tab === t.key ? 'border-yellow-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Invested" value={formatINR(totalInvested)} accent="blue" />
        <StatCard
          label="Current Value"
          value={formatINR(totalNow)}
          delta={`${totalPct.toFixed(2)}%`}
          positive={totalPct >= 0}
          accent="green"
        />
        <StatCard label="Total Returns" value={formatINR(totalReturns)} positive={totalReturns >= 0} accent="amber" />
        <StatCard label="Holdings" value={`${data.length}`} accent="indigo" />
      </div>

      {/* Returns % chart */}
      <Card title="Top 15 Holdings by Return %">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 40, left: 40, bottom: 5 }}>
            <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={{ fill: CHART_THEME.text, fontSize: 11 }} width={70} />
            <Tooltip
              formatter={(v: number) => [`${v}%`, 'Return']}
              contentStyle={{ background: CHART_THEME.bg, border: `1px solid ${CHART_THEME.border}`, borderRadius: 8 }}
              itemStyle={{ color: CHART_THEME.text }}
              labelStyle={{ color: CHART_THEME.text }}
            />
            <Bar dataKey="returns" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, i) => (
                <rect key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-300 tracking-tight">All Holdings ({filtered.length})</h3>
          <div className="relative w-64">
            <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticker…"
              className="w-full pl-9 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <Table<Stock>
          data={filtered}
          columns={[
            {
              key: 'Ticker',
              label: 'Ticker',
              render: (r) => <span className="font-mono font-bold text-white">{r.Ticker}</span>,
            },
            { key: 'Qty', label: 'Qty', align: 'right', render: (r) => <span className="font-mono">{r.Qty}</span> },
            {
              key: 'Purchase_cost',
              label: 'Purchase Cost',
              align: 'right',
              render: (r) => <span className="font-mono">{formatINR(r.Purchase_cost)}</span>,
            },
            {
              key: 'LTP',
              label: 'LTP',
              align: 'right',
              render: (r) => <span className="font-mono">{r.LTP?.toFixed(2)}</span>,
            },
            {
              key: 'Value_at_cost',
              label: 'Invested',
              align: 'right',
              render: (r) => <span className="font-mono">{formatINR(r.Value_at_cost)}</span>,
            },
            {
              key: 'Value_now',
              label: 'Current Value',
              align: 'right',
              render: (r) => <span className="font-mono">{formatINR(r.Value_now)}</span>,
            },
            { key: 'Returns', label: 'Returns', align: 'right', render: (r) => <ReturnsCell value={r.Returns} /> },
            { key: 'Returns_pct', label: 'Return %', align: 'right', render: (r) => <PctCell value={r.Returns_pct} /> },
          ]}
        />
      </div>
    </div>
  )
}
