// Helper: highlight recent purchases (current or previous month)
function isRecentPurchase(purchaseDateStr: string | undefined | null): boolean {
  if (!purchaseDateStr) return false
  const match = purchaseDateStr.match(/^\d{4}-\d{2}-\d{2}/)
  const dateStr = match ? match[0] : purchaseDateStr
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return false
  const today = new Date()
  let prevMonth = today.getMonth() - 1
  let prevYear = today.getFullYear()
  if (prevMonth < 0) { prevMonth = 11; prevYear-- }
  const y = date.getFullYear(), m = date.getMonth()
  return (y === today.getFullYear() && m === today.getMonth()) || (y === prevYear && m === prevMonth)
}

import { useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { useStocks, useStocksRajesh, useStocksSandhya, useMutualFunds, useMFRajesh, useMFSandhya, useMFCategories } from '../hooks/useApi'
import { StatCard, Spinner, Card, PageHeader, Table, ReturnsCell, PctCell, TabBar } from '../components/UI'
import { XIRRCard } from '../components/XIRRCard'
import { calculateXIRR } from '../utils/xirrUtils'
import { formatINR, CHART_COLORS, CHART_THEME_LIGHT, CHART_THEME_DARK } from '../utils/format'
import { exportToCSV } from '../utils/export'
import { useTheme } from '../hooks/useTheme'
import { useUsers } from '../hooks/useUsers'
import type { Stock, MutualFund } from '../hooks/useApi'
import { IconSearch, IconDownload } from '@tabler/icons-react'
import { cn } from '../utils/format'

type PersonTab = 'all' | string
type OuterTab = 'mf' | 'stocks'

// ── MF section ────────────────────────────────────────────────────────────
function MFSection({ CT, tab, setTab }: { CT: typeof CHART_THEME_LIGHT; tab: PersonTab; setTab: (t: PersonTab) => void }) {
  const [search, setSearch] = useState('')
  const [catChart, setCatChart] = useState<'pie' | 'pyramid'>('pyramid')

  const { data: allMF, isLoading: allL } = useMutualFunds()
  const { data: rajeshMF, isLoading: rajL } = useMFRajesh()
  const { data: sandhyaMF, isLoading: sanL } = useMFSandhya()
  const { data: cats } = useMFCategories()

  const activeData = tab === 'all' ? allMF : tab === 'user1' ? rajeshMF : tab === 'user2' ? sandhyaMF : []
  const isLoading = tab === 'all' ? allL : tab === 'user1' ? rajL : tab === 'user2' ? sanL : false

  const data = (activeData || []).filter((f) => f.Fund_Name && f.Fund_Name.trim() !== '')
  const filtered = data.filter((f) => (f.Fund_Name || '').toLowerCase().includes(search.toLowerCase()))

  const totalInv = data.reduce((a, f) => a + (f.Value_at_cost || 0), 0)
  const totalNow = data.reduce((a, f) => a + (f.Value_now || 0), 0)
  const totalRet = totalNow - totalInv
  const totalPct = totalInv ? (totalRet / totalInv) * 100 : 0

  function getCashflows(dataArr: MutualFund[]): { amount: number; date: string }[] {
    const totalVal = dataArr.reduce((a, f) => a + (f.Value_now || 0), 0)
    const flows: { amount: number; date: string }[] = []
    dataArr.forEach((mf) => {
      if (mf.Value_at_cost && mf.Purchase_Date) flows.push({ amount: -Math.abs(mf.Value_at_cost), date: mf.Purchase_Date })
    })
    if (totalVal > 0) flows.push({ amount: totalVal, date: new Date().toISOString().slice(0, 10) })
    return flows
  }

  const xirrValue = calculateXIRR(
    tab === 'all' ? getCashflows(allMF || []) :
    tab === 'user1' ? getCashflows(rajeshMF || []) :
    tab === 'user2' ? getCashflows(sandhyaMF || []) :
    []
  )

  const catPie = (cats || []).map((c) => ({ name: c.Category, value: Math.round(c.Value_now) }))

  const barData = [...data]
    .filter((f) => f.Value_now != null && f.Value_at_cost != null)
    .sort((a, b) => (b.Value_now || 0) - (a.Value_now || 0))
    .slice(0, 12)
    .map((f) => ({
      name: (f.Fund_Name || '').length > 25 ? (f.Fund_Name || '').slice(0, 25) + '…' : f.Fund_Name || '',
      invested: f.Value_at_cost || 0,
      current: f.Value_now || 0,
    }))

  type SummaryRow = { Fund_Name: string; Category: string; Units: number; Current_NAV: number; Value_at_cost: number; Value_now: number; Returns: number; Returns_pct: number; Avg_Purchase_Price: number | null }
  const summaryData: SummaryRow[] = (() => {
    const map = new Map<number, { Fund_Name: string; Category: string; Units: number; Current_NAV: number; Value_at_cost: number; Value_now: number }>()
    for (const f of data) {
      const existing = map.get(f.AMFI_CODE)
      if (existing) { existing.Units += f.Units || 0; existing.Value_at_cost += f.Value_at_cost || 0; existing.Value_now += f.Value_now || 0; existing.Current_NAV = f.Current_NAV || existing.Current_NAV }
      else map.set(f.AMFI_CODE, { Fund_Name: f.Fund_Name, Category: f.Category || 'Other', Units: f.Units || 0, Current_NAV: f.Current_NAV || 0, Value_at_cost: f.Value_at_cost || 0, Value_now: f.Value_now || 0 })
    }
    return Array.from(map.values()).map((r) => ({ ...r, Returns: r.Value_now - r.Value_at_cost, Returns_pct: r.Value_at_cost ? ((r.Value_now - r.Value_at_cost) / r.Value_at_cost) * 100 : 0, Avg_Purchase_Price: r.Units ? r.Value_at_cost / r.Units : null }))
  })()

  type DetailRow = MutualFund & { Returns: number; Returns_pct: number; Avg_Purchase_Price: number | null }
  const detailData: DetailRow[] = filtered
    .map((r) => ({ ...r, Returns: r.Value_now - r.Value_at_cost, Returns_pct: r.Value_at_cost ? ((r.Value_now - r.Value_at_cost) / r.Value_at_cost) * 100 : 0, Avg_Purchase_Price: r.Units ? r.Value_at_cost / r.Units : null }))
    .sort((a, b) => new Date(b.Purchase_Date || '').getTime() - new Date(a.Purchase_Date || '').getTime())

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total Invested" value={formatINR(totalInv)} accent="blue" />
        <StatCard label="Current Value" value={formatINR(totalNow)} delta={`${totalPct.toFixed(2)}%`} positive={totalPct >= 0} accent="green" />
        <StatCard label="Total Returns" value={formatINR(totalRet)} positive={totalRet >= 0} accent="amber" />
        <StatCard label="Holdings" value={`${new Set(data.map((f) => f.AMFI_CODE)).size}`} accent="indigo" />
        <XIRRCard value={xirrValue} />
      </div>

      {tab === 'all' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Category Distribution (Current Value)">
            <div className="flex justify-end mb-2">
              <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
                <button onClick={() => setCatChart('pie')} className={cn('px-3 py-1 transition-all', catChart === 'pie' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>Pie</button>
                <button onClick={() => setCatChart('pyramid')} className={cn('px-3 py-1 transition-all', catChart === 'pyramid' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>Pyramid</button>
              </div>
            </div>
            {catChart === 'pie' ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={catPie} cx="50%" cy="50%" innerRadius={55} outerRadius={105} dataKey="value" nameKey="name" paddingAngle={2}
                    label={({ name, percent, x, y, midAngle }) => {
                      const RADIAN = Math.PI / 180
                      const cx2 = x + 125 * Math.cos(-midAngle * RADIAN) * 0.07
                      const cy2 = y + 125 * Math.sin(-midAngle * RADIAN) * 0.07
                      if (percent < 0.04) return null
                      return <text x={cx2} y={cy2} fill={CT.text} textAnchor={x > 200 ? 'start' : 'end'} dominantBaseline="central" fontSize={11}>{name} ({(percent * 100).toFixed(0)}%)</text>
                    }}
                    labelLine={{ stroke: CT.border, strokeWidth: 1 }}
                  >
                    {catPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatINR(v)} contentStyle={{ background: CT.bg, border: `1px solid ${CT.border}`, borderRadius: 8 }} itemStyle={{ color: CT.text }} labelStyle={{ color: CT.text }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (() => {
              const sorted = [...catPie].sort((a, b) => a.value - b.value)
              const maxVal = Math.max(...sorted.map((c) => c.value), 1)
              const total = sorted.reduce((s, c) => s + c.value, 0)
              return (
                <div className="flex flex-col items-center gap-1.5 py-2">
                  {sorted.map((c, i) => {
                    const pct = total ? (c.value / total) * 100 : 0
                    return (
                      <div key={c.name} className="relative flex items-center justify-center py-2 rounded-md text-center hover:brightness-110 transition-all"
                        style={{ width: `${25 + (c.value / maxVal) * 75}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
                        title={`${c.name}: ${formatINR(c.value)}`}
                      >
                        <span className="text-white text-xs font-semibold drop-shadow-md">{c.name} — {pct.toFixed(1)}%</span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </Card>

          <Card title="Category Returns">
            <div className="space-y-2 pt-1">
              {(cats || []).map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-foreground text-xs flex-1 truncate">{c.Category}</span>
                  <span className="text-muted-foreground text-xs font-mono">{formatINR(c.Value_at_cost)}</span>
                  <span className={cn('text-xs font-mono font-semibold w-16 text-right', c.Returns_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                    {c.Returns_pct >= 0 ? '+' : ''}{c.Returns_pct.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Card title="Top Holdings — Invested vs Current Value">
        {isLoading ? <Spinner /> : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 40, left: 8, bottom: 5 }}>
              <CartesianGrid stroke={CT.grid} strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fill: CT.text, fontSize: 10 }} tickFormatter={(v) => formatINR(v)} />
              <YAxis type="category" dataKey="name" tick={{ fill: CT.text, fontSize: 10 }} width={160} />
              <Tooltip formatter={(v: number, n: string) => [formatINR(v), n]} contentStyle={{ background: CT.bg, border: `1px solid ${CT.border}`, borderRadius: 8 }} itemStyle={{ color: CT.text }} labelStyle={{ color: CT.text }} />
              <Legend wrapperStyle={{ color: CT.text }} />
              <Bar dataKey="invested" name="Invested" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              <Bar dataKey="current" name="Current" fill="#22c55e" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Holdings Summary">
        {isLoading ? <Spinner /> : (
          <Table<SummaryRow> data={summaryData} columns={[
            { key: '_i', label: '#', render: (_r, i) => <span className="text-muted-foreground text-xs font-mono">{i + 1}</span> },
            { key: 'Fund_Name', label: 'Fund Name', render: (r) => <span className="text-foreground text-xs font-medium">{r.Fund_Name}</span> },
            { key: 'Category', label: 'Category', render: (r) => <span className="text-muted-foreground text-xs">{r.Category}</span> },
            { key: 'Units', label: 'Units', align: 'right', render: (r) => <span className="font-mono text-xs">{r.Units?.toFixed(3)}</span> },
            { key: 'Avg_Purchase_Price', label: 'Avg NAV', align: 'right', render: (r) => <span className="font-mono text-xs">{r.Avg_Purchase_Price != null ? `₹${r.Avg_Purchase_Price.toFixed(2)}` : '—'}</span> },
            { key: 'Current_NAV', label: 'Current NAV', align: 'right', render: (r) => <span className="font-mono text-xs">₹{r.Current_NAV?.toFixed(2)}</span> },
            { key: 'Value_at_cost', label: 'Invested', align: 'right', render: (r) => <span className="font-mono text-xs">{formatINR(r.Value_at_cost)}</span> },
            { key: 'Value_now', label: 'Current Value', align: 'right', render: (r) => <span className="font-mono text-xs">{formatINR(r.Value_now)}</span> },
            { key: 'Returns', label: 'Returns', align: 'right', render: (r) => <ReturnsCell value={r.Returns} /> },
            { key: 'Returns_pct', label: 'Return %', align: 'right', render: (r) => <PctCell value={r.Returns_pct} /> },
          ]} />
        )}
      </Card>

      <Card title="Holdings Detail">
        <div className="mb-4 relative">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search fund name…"
            className="w-full pl-9 pr-4 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {isLoading ? <Spinner /> : (
          <Table<DetailRow> data={detailData}
            columns={[
              { key: '_i', label: '#', render: (_r, i) => <span className="text-muted-foreground text-xs font-mono">{i + 1}</span> },
              { key: 'Fund_Name', label: 'Fund Name', render: (r) => <span className="text-foreground text-xs font-medium">{r.Fund_Name}</span> },
              { key: 'Category', label: 'Category', render: (r) => <span className="text-muted-foreground text-xs">{r.Category}</span> },
              { key: 'Units', label: 'Units', align: 'right', render: (r) => <span className="font-mono text-xs">{r.Units?.toFixed(3)}</span> },
              { key: 'Purchase_NAV', label: 'Purchase NAV', align: 'right', render: (r) => <span className="font-mono text-xs">{r.Purchase_NAV != null ? `₹${Number(r.Purchase_NAV).toFixed(2)}` : '—'}</span> },
              { key: 'Purchase_Date', label: 'Purchase Date', align: 'right', render: (r) => { const d = r.Purchase_Date ? String(r.Purchase_Date).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? r.Purchase_Date : '—'; return <span className="font-mono text-xs">{d}</span> } },
              { key: 'Current_NAV', label: 'Current NAV', align: 'right', render: (r) => <span className="font-mono text-xs">₹{r.Current_NAV?.toFixed(2)}</span> },
              { key: 'Value_at_cost', label: 'Invested', align: 'right', render: (r) => <span className="font-mono text-xs">{formatINR(r.Value_at_cost)}</span> },
              { key: 'Value_now', label: 'Current Value', align: 'right', render: (r) => <span className="font-mono text-xs">{formatINR(r.Value_now)}</span> },
              { key: 'Returns', label: 'Returns', align: 'right', render: (r) => <ReturnsCell value={r.Returns} /> },
              { key: 'Returns_pct', label: 'Return %', align: 'right', render: (r) => <PctCell value={r.Returns_pct} /> },
            ]}
            rowClassName={(row) => isRecentPurchase(row.Purchase_Date) ? 'bg-amber-50 dark:bg-yellow-900/30' : undefined}
          />
        )}
      </Card>
    </div>
  )
}

// ── Stocks section ────────────────────────────────────────────────────────
function StocksSection({ CT, tab, setTab }: { CT: typeof CHART_THEME_LIGHT; tab: PersonTab; setTab: (t: PersonTab) => void }) {
  const [search, setSearch] = useState('')

  const { data: allStocks, isLoading: allL } = useStocks()
  const { data: rajeshStocks, isLoading: rajL } = useStocksRajesh()
  const { data: sandhyaStocks, isLoading: sanL } = useStocksSandhya()

  const activeData = tab === 'all' ? allStocks : tab === 'user1' ? rajeshStocks : tab === 'user2' ? sandhyaStocks : []
  const isLoading = tab === 'all' ? allL : tab === 'user1' ? rajL : tab === 'user2' ? sanL : false
  const data = activeData || []
  const filtered = data.filter((s) => s.Ticker.toLowerCase().includes(search.toLowerCase()))

  const totalInvested = data.reduce((a, s) => a + (s.Value_at_cost || 0), 0)
  const totalNow = data.reduce((a, s) => a + (s.Value_now || 0), 0)
  const totalReturns = totalNow - totalInvested
  const totalPct = totalInvested ? (totalReturns / totalInvested) * 100 : 0

  const chartData = [...data].sort((a, b) => b.Returns_pct - a.Returns_pct).slice(0, 15).map((s) => ({
    name: s.Ticker,
    returns: parseFloat(s.Returns_pct.toFixed(2)),
    fill: s.Returns_pct >= 0 ? '#22c55e' : '#f43f5e',
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Invested" value={formatINR(totalInvested)} accent="blue" />
        <StatCard label="Current Value" value={formatINR(totalNow)} delta={`${totalPct.toFixed(2)}%`} positive={totalPct >= 0} accent="green" />
        <StatCard label="Total Returns" value={formatINR(totalReturns)} positive={totalReturns >= 0} accent="amber" />
        <StatCard label="Holdings" value={`${data.length}`} accent="indigo" />
      </div>

      <Card title="Top 15 Holdings by Return %">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 40, left: 40, bottom: 5 }}>
            <CartesianGrid stroke={CT.grid} strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fill: CT.text, fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={{ fill: CT.text, fontSize: 11 }} width={70} />
            <Tooltip formatter={(v: number) => [`${v}%`, 'Return']} contentStyle={{ background: CT.bg, border: `1px solid ${CT.border}`, borderRadius: 8 }} itemStyle={{ color: CT.text }} labelStyle={{ color: CT.text }} />
            <Bar dataKey="returns" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, i) => (
                <rect key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">All Holdings ({filtered.length})</h3>
          <div className="relative w-64">
            <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ticker…"
              className="w-full pl-9 pr-4 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        {isLoading ? <Spinner /> : (
          <Table<Stock> data={filtered} columns={[
            { key: 'Ticker', label: 'Ticker', render: (r) => <span className="font-mono font-bold text-foreground">{r.Ticker}</span> },
            { key: 'Qty', label: 'Qty', align: 'right', render: (r) => <span className="font-mono">{r.Qty}</span> },
            { key: 'Purchase_cost', label: 'Purchase Cost', align: 'right', render: (r) => <span className="font-mono">{formatINR(r.Purchase_cost)}</span> },
            { key: 'LTP', label: 'LTP', align: 'right', render: (r) => <span className="font-mono">{r.LTP?.toFixed(2)}</span> },
            { key: 'Value_at_cost', label: 'Invested', align: 'right', render: (r) => <span className="font-mono">{formatINR(r.Value_at_cost)}</span> },
            { key: 'Value_now', label: 'Current Value', align: 'right', render: (r) => <span className="font-mono">{formatINR(r.Value_now)}</span> },
            { key: 'Returns', label: 'Returns', align: 'right', render: (r) => <ReturnsCell value={r.Returns} /> },
            { key: 'Returns_pct', label: 'Return %', align: 'right', render: (r) => <PctCell value={r.Returns_pct} /> },
          ]} />
        )}
      </div>
    </div>
  )
}

// ── Main Holdings page ────────────────────────────────────────────────────
export default function Holdings() {
  const [outer, setOuter] = useState<OuterTab>('mf')
  const [personTab, setPersonTab] = useState<PersonTab>('all')
  const { theme } = useTheme()
  const CT = theme === 'dark' ? CHART_THEME_DARK : CHART_THEME_LIGHT
  const { users } = useUsers()

  // Data for CSV export
  const { data: allMF } = useMutualFunds()
  const { data: allStocks } = useStocks()

  const personTabs = [{ key: 'all', label: 'All' }, ...users.map(u => ({ key: u.key, label: u.name }))]

  const handleExport = () => {
    if (outer === 'mf') {
      const rows = (allMF || []).map(f => ({
        Fund: f.Fund_Name, Category: f.Category, AMFI: f.AMFI_CODE,
        Invested: f.Value_at_cost, 'Current Value': f.Value_now,
        Returns: (f.Value_now ?? 0) - (f.Value_at_cost ?? 0),
        'Purchase Date': f.Purchase_Date,
      }))
      exportToCSV(rows as Record<string, unknown>[], `samridhi-mutual-funds-${new Date().toISOString().slice(0,10)}`)
    } else {
      const rows = (allStocks || []).map(s => ({
        Ticker: s.Ticker, Qty: s.Qty,
        'Buy Price': s.Purchase_cost, 'CMP': s.LTP,
        Invested: s.Value_at_cost, 'Current Value': s.Value_now,
        Returns: (s.Value_now ?? 0) - (s.Value_at_cost ?? 0),
      }))
      exportToCSV(rows as Record<string, unknown>[], `samridhi-stocks-${new Date().toISOString().slice(0,10)}`)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Holdings" subtitle="Mutual Funds & Stocks">
        <button
          onClick={handleExport}
          aria-label="Export holdings as CSV"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all no-print"
        >
          <IconDownload size={14} aria-hidden="true" />
          Export CSV
        </button>
      </PageHeader>
      {/* Both tab bars on the same row */}
      <div className="flex items-center gap-3 flex-wrap">
        <TabBar
          tabs={[{ key: 'mf', label: 'Mutual Funds' }, { key: 'stocks', label: 'Stocks & Smallcase' }]}
          active={outer}
          onChange={(k) => { setOuter(k as OuterTab); setPersonTab('all') }}
        />
        <TabBar
          tabs={personTabs}
          active={personTab}
          onChange={(k) => setPersonTab(k)}
        />
      </div>
      {outer === 'mf'
        ? <MFSection CT={CT} tab={personTab} setTab={setPersonTab} />
        : <StocksSection CT={CT} tab={personTab} setTab={setPersonTab} />}
    </div>
  )
}
