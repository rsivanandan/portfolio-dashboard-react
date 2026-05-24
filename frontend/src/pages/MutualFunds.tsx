// ...existing code...
// Helper to check if a date is in the current or previous month
function isRecentPurchase(purchaseDateStr: string | undefined | null): boolean {
  if (!purchaseDateStr) return false;
  const match = purchaseDateStr.match(/^\d{4}-\d{2}-\d{2}/);
  const dateStr = match ? match[0] : purchaseDateStr;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  const today = new Date();
  const thisMonth = today.getMonth();
  const thisYear = today.getFullYear();
  let prevMonth = thisMonth - 1;
  let prevYear = thisYear;
  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear--;
  }
  const year = date.getFullYear();
  const month = date.getMonth();
  return (
    (year === thisYear && month === thisMonth) ||
    (year === prevYear && month === prevMonth)
  );
}

import { useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts'
import { useMutualFunds, useMFRajesh, useMFSandhya, useMFCategories } from '../hooks/useApi'
import { getStoredUsers } from '../hooks/useUsers'
import { StatCard, Spinner, Card, PageHeader, Table, ReturnsCell, PctCell } from '../components/UI'
import { XIRRCard } from '../components/XIRRCard'
import { calculateXIRR } from '../utils/xirrUtils'
import { formatINR, CHART_COLORS, CHART_THEME } from '../utils/format'
import type { MutualFund } from '../hooks/useApi'
import { IconSearch } from '@tabler/icons-react'

type Tab = 'all' | 'rajesh' | 'sandhya'

export default function MutualFunds() {
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [catChart, setCatChart] = useState<'pie' | 'pyramid'>('pyramid')
  const users = getStoredUsers()

  const { data: allMF, isLoading: allL } = useMutualFunds()
  const { data: rajeshMF, isLoading: rajL } = useMFRajesh()
  const { data: sandhyaMF, isLoading: sanL } = useMFSandhya()
  const { data: cats } = useMFCategories()

  const activeData = tab === 'all' ? allMF : tab === 'rajesh' ? rajeshMF : sandhyaMF
  const isLoading = tab === 'all' ? allL : tab === 'rajesh' ? rajL : sanL

  const data = (activeData || []).filter((f) => f.Fund_Name && f.Fund_Name.trim() !== '')
  const filtered = data.filter((f) => (f.Fund_Name || '').toLowerCase().includes(search.toLowerCase()))

  const totalInv = data.reduce((a, f) => a + (f.Value_at_cost || 0), 0)
  const totalNow = data.reduce((a, f) => a + (f.Value_now || 0), 0)
  const totalRet = totalNow - totalInv
  const totalPct = totalInv ? (totalRet / totalInv) * 100 : 0

  function getCashflows(dataArr: MutualFund[]): { amount: number; date: string }[] {
    if (!dataArr || dataArr.length === 0) return [];
    const flows: { amount: number; date: string }[] = [];
    dataArr.forEach((mf) => {
      if (mf.Value_at_cost && mf.Purchase_Date) {
        flows.push({ amount: -Math.abs(mf.Value_at_cost), date: mf.Purchase_Date });
      }
    });
    if (totalNow > 0) {
      flows.push({ amount: totalNow, date: new Date().toISOString().slice(0, 10) });
    }
    return flows;
  }

  const allCashflows = getCashflows(allMF || []);
  const rajeshCashflows = getCashflows(rajeshMF || []);
  const sandhyaCashflows = getCashflows(sandhyaMF || []);

  let xirrValue = null;
  if (tab === 'all') xirrValue = calculateXIRR(allCashflows);
  else if (tab === 'rajesh') xirrValue = calculateXIRR(rajeshCashflows);
  else if (tab === 'sandhya') xirrValue = calculateXIRR(sandhyaCashflows);

  const catPie = (cats || []).map((c) => ({
    name: c.Category,
    value: Math.round(c.Value_now),
  }))

  const barData = [...data]
    .filter((f) => f.Value_now != null && f.Value_at_cost != null)
    .sort((a, b) => (b.Value_now || 0) - (a.Value_now || 0))
    .slice(0, 12)
    .map((f) => ({
      name: (f.Fund_Name || '').length > 25 ? (f.Fund_Name || '').slice(0, 25) + '…' : f.Fund_Name || '',
      invested: f.Value_at_cost || 0,
      current: f.Value_now || 0,
    }))

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All Funds' },
    { key: 'rajesh', label: users[0]?.name ?? 'User 1' },
    { key: 'sandhya', label: users[1]?.name ?? 'User 2' },
  ]

  // Grouped summary data
  type SummaryRow = {
    Fund_Name: string;
    Category: string;
    Units: number;
    Current_NAV: number;
    Value_at_cost: number;
    Value_now: number;
    Returns: number;
    Returns_pct: number;
    Avg_Purchase_Price: number | null;
  }

  const summaryData: SummaryRow[] = (() => {
    const map = new Map<number, { Fund_Name: string; Category: string; Units: number; Current_NAV: number; Value_at_cost: number; Value_now: number }>()
    for (const f of data) {
      const key = f.AMFI_CODE
      const existing = map.get(key)
      if (existing) {
        existing.Units += f.Units || 0
        existing.Value_at_cost += f.Value_at_cost || 0
        existing.Value_now += f.Value_now || 0
        existing.Current_NAV = f.Current_NAV || existing.Current_NAV
      } else {
        map.set(key, {
          Fund_Name: f.Fund_Name,
          Category: f.Category || 'Other',
          Units: f.Units || 0,
          Current_NAV: f.Current_NAV || 0,
          Value_at_cost: f.Value_at_cost || 0,
          Value_now: f.Value_now || 0,
        })
      }
    }
    return Array.from(map.values()).map((r) => ({
      ...r,
      Returns: r.Value_now - r.Value_at_cost,
      Returns_pct: r.Value_at_cost ? ((r.Value_now - r.Value_at_cost) / r.Value_at_cost) * 100 : 0,
      Avg_Purchase_Price: r.Units ? r.Value_at_cost / r.Units : null,
    }))
  })()

  // Detail data with extra computed fields
  type DetailRow = MutualFund & { Returns: number; Returns_pct: number; Avg_Purchase_Price: number | null }

  const detailData: DetailRow[] = filtered.map((r) => ({
    ...r,
    Returns: r.Value_now - r.Value_at_cost,
    Returns_pct: r.Value_at_cost ? ((r.Value_now - r.Value_at_cost) / r.Value_at_cost) * 100 : 0,
    Avg_Purchase_Price: r.Units ? r.Value_at_cost / r.Units : null,
  }))

  return (
    <div className="space-y-6">
      <PageHeader title="Mutual Funds" subtitle={`${data.length} holdings`} />

      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-zinc-800 pb-0">
        {tabs.map((t) => (
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

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total Invested" value={formatINR(totalInv)} accent="blue" />
        <StatCard
          label="Current Value"
          value={formatINR(totalNow)}
          delta={`${totalPct.toFixed(2)}%`}
          positive={totalPct >= 0}
          accent="green"
        />
        <StatCard label="Total Returns" value={formatINR(totalRet)} positive={totalRet >= 0} accent="amber" />
        <StatCard label="Holdings" value={`${new Set(data.map((f) => f.AMFI_CODE)).size}`} accent="indigo" />
        <XIRRCard value={xirrValue} />
      </div>

      {/* Category charts — only on "all" tab */}
      {tab === 'all' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Category Distribution (Current Value)">
            <div className="flex justify-end mb-2">
              <div className="inline-flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
                <button
                  onClick={() => setCatChart('pie')}
                  className={`px-3 py-1 transition-all ${catChart === 'pie' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}
                >
                  Pie
                </button>
                <button
                  onClick={() => setCatChart('pyramid')}
                  className={`px-3 py-1 transition-all ${catChart === 'pyramid' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}
                >
                  Pyramid
                </button>
              </div>
            </div>
            {catChart === 'pie' ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={catPie}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={105}
                    dataKey="value"
                    nameKey="name"
                    paddingAngle={2}
                    label={({ name, percent, x, y, midAngle }) => {
                      const RADIAN = Math.PI / 180
                      const radius = 125
                      const cx2 = x + radius * Math.cos(-midAngle * RADIAN) * 0.07
                      const cy2 = y + radius * Math.sin(-midAngle * RADIAN) * 0.07
                      if (percent < 0.04) return null
                      return (
                        <text x={cx2} y={cy2} fill="#d4d4d8" textAnchor={x > 200 ? 'start' : 'end'} dominantBaseline="central" fontSize={11}>
                          {name} ({(percent * 100).toFixed(0)}%)
                        </text>
                      )
                    }}
                    labelLine={{ stroke: '#52525b', strokeWidth: 1 }}
                  >
                    {catPie.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
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
                </PieChart>
              </ResponsiveContainer>
            ) : (
              (() => {
                const sorted = [...catPie].sort((a, b) => a.value - b.value)
                const maxVal = Math.max(...sorted.map((c) => c.value), 1)
                const total = sorted.reduce((s, c) => s + c.value, 0)
                return (
                  <div className="flex flex-col items-center gap-1.5 py-2">
                    {sorted.map((c, i) => {
                      const pct = total ? (c.value / total) * 100 : 0
                      const widthPct = 25 + (c.value / maxVal) * 75
                      return (
                        <div
                          key={c.name}
                          className="relative flex items-center justify-center py-2 rounded-md text-center transition-all hover:brightness-125"
                          style={{
                            width: `${widthPct}%`,
                            background: CHART_COLORS[i % CHART_COLORS.length],
                            borderRadius: '0.5rem',
                          }}
                          title={`${c.name}: ${formatINR(c.value)}`}
                        >
                          <span className="text-white text-xs font-semibold drop-shadow-md">
                            {c.name} — {pct.toFixed(1)}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()
            )}
          </Card>

          <Card title="Category Returns">
            <div className="space-y-2 pt-1">
              {(cats || []).map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  <span className="text-zinc-300 text-xs flex-1 truncate">{c.Category}</span>
                  <span className="text-zinc-400 text-xs font-mono">{formatINR(c.Value_at_cost)}</span>
                  <span
                    className={`text-xs font-mono font-semibold w-16 text-right ${c.Returns_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                  >
                    {c.Returns_pct >= 0 ? '+' : ''}
                    {c.Returns_pct.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Invested vs current bar */}
      <Card title="Top Holdings — Invested vs Current Value">
        {isLoading ? (
          <Spinner />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 40, left: 8, bottom: 5 }}>
              <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" />
              <XAxis
                type="number"
                tick={{ fill: CHART_THEME.text, fontSize: 10 }}
                tickFormatter={(v) => formatINR(v)}
              />
              <YAxis type="category" dataKey="name" tick={{ fill: CHART_THEME.text, fontSize: 10 }} width={160} />
              <Tooltip
                formatter={(v: number, n: string) => [formatINR(v), n]}
                contentStyle={{
                  background: CHART_THEME.bg,
                  border: `1px solid ${CHART_THEME.border}`,
                  borderRadius: 8,
                }}
                itemStyle={{ color: CHART_THEME.text }}
                labelStyle={{ color: CHART_THEME.text }}
              />
              <Legend wrapperStyle={{ color: CHART_THEME.text }} />
              <Bar dataKey="invested" name="Invested" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              <Bar dataKey="current" name="Current" fill="#22c55e" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Holdings Summary — grouped by fund */}
      <Card title="Holdings Summary">
        {isLoading ? (
          <Spinner />
        ) : (
          <Table<SummaryRow>
            data={summaryData}
            columns={[
              {
                key: '_index',
                label: '#',
                render: (_r, i) => <span className="text-zinc-500 text-xs font-mono">{i + 1}</span>,
              },
              {
                key: 'Fund_Name',
                label: 'Fund Name',
                render: (r) => <span className="text-white text-xs font-medium leading-tight">{r.Fund_Name}</span>,
              },
              {
                key: 'Category',
                label: 'Category',
                render: (r) => <span className="text-zinc-400 text-xs">{r.Category}</span>,
              },
              {
                key: 'Units',
                label: 'Units',
                align: 'right',
                render: (r) => <span className="font-mono text-xs">{r.Units?.toFixed(3)}</span>,
              },
              {
                key: 'Avg_Purchase_Price',
                label: 'Avg Purchase NAV',
                align: 'right',
                render: (r) => (
                  <span className="font-mono text-xs">
                    {r.Avg_Purchase_Price != null ? `₹${r.Avg_Purchase_Price.toFixed(2)}` : '—'}
                  </span>
                ),
              },
              // Removed duplicate Avg Purchase NAV column
              {
                key: 'Current_NAV',
                label: 'Current NAV',
                align: 'right',
                render: (r) => <span className="font-mono text-xs">₹{r.Current_NAV?.toFixed(2)}</span>,
              },
              {
                key: 'Value_at_cost',
                label: 'Invested',
                align: 'right',
                render: (r) => <span className="font-mono text-xs">{formatINR(r.Value_at_cost)}</span>,
              },
              {
                key: 'Value_now',
                label: 'Current Value',
                align: 'right',
                render: (r) => <span className="font-mono text-xs">{formatINR(r.Value_now)}</span>,
              },
              {
                key: 'Returns',
                label: 'Returns',
                align: 'right',
                render: (r) => <ReturnsCell value={r.Returns} />, 
              },
              {
                key: 'Returns_pct',
                label: 'Return %',
                align: 'right',
                render: (r) => <PctCell value={r.Returns_pct} />, 
              },
              
            ]}
          />
        )}
      </Card>

      {/* Holdings Detail — individual transactions */}
      <Card title="Holdings Detail">
        <div className="mb-4 relative">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fund name…"
            className="w-full pl-9 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        {isLoading ? (
          <Spinner />
        ) : (
          <Table<DetailRow>
            data={detailData}
            columns={[
              {
                key: '_index',
                label: '#',
                render: (_r, i) => <span className="text-zinc-500 text-xs font-mono">{i + 1}</span>,
              },
              {
                key: 'Fund_Name',
                label: 'Fund Name',
                render: (r) => <span className="text-white text-xs font-medium leading-tight">{r.Fund_Name}</span>,
              },
              {
                key: 'Category',
                label: 'Category',
                render: (r) => <span className="text-zinc-400 text-xs">{r.Category}</span>,
              },
              {
                key: 'Units',
                label: 'Units',
                align: 'right',
                render: (r) => <span className="font-mono text-xs">{r.Units?.toFixed(3)}</span>,
              },
              {
                key: 'Purchase_NAV',
                label: 'Purchase NAV',
                align: 'right',
                render: (r) => <span className="font-mono text-xs">{r.Purchase_NAV != null ? `₹${Number(r.Purchase_NAV).toFixed(2)}` : '—'}</span>,
              },
              {
                key: 'Purchase_Date',
                label: 'Purchase Date',
                align: 'right',
                render: (r) => {
                  let date = r.Purchase_Date;
                  if (date && typeof date === 'string') {
                    const match = date.match(/^\d{4}-\d{2}-\d{2}/);
                    date = match ? match[0] : date;
                  }
                  return <span className="font-mono text-xs">{date ? date : '—'}</span>;
                },
              },
              {
                key: 'Current_NAV',
                label: 'Current NAV',
                align: 'right',
                render: (r) => <span className="font-mono text-xs">₹{r.Current_NAV?.toFixed(2)}</span>,
              },
              {
                key: 'Value_at_cost',
                label: 'Invested',
                align: 'right',
                render: (r) => <span className="font-mono text-xs">{formatINR(r.Value_at_cost)}</span>,
              },
              {
                key: 'Value_now',
                label: 'Current Value',
                align: 'right',
                render: (r) => <span className="font-mono text-xs">{formatINR(r.Value_now)}</span>,
              },
              {
                key: 'Returns',
                label: 'Returns',
                align: 'right',
                render: (r) => <ReturnsCell value={r.Returns} />,
              },
              {
                key: 'Returns_pct',
                label: 'Return %',
                align: 'right',
                render: (r) => <PctCell value={r.Returns_pct} />,
              },
              {
                key: 'Avg_Purchase_NAV',
                label: 'Avg Purchase NAV',
                align: 'right',
                render: (r) => (
                  <span className="font-mono text-xs">
                    {r.Avg_Purchase_Price != null ? `₹${r.Avg_Purchase_Price.toFixed(2)}` : '—'}
                  </span>
                ),
              },
            ]}
            rowClassName={(row) =>
              isRecentPurchase(row.Purchase_Date)
                ? 'bg-yellow-900/40 transition-colors'
                : undefined
            }
          />
        )}
      </Card>
    </div>
  )
}