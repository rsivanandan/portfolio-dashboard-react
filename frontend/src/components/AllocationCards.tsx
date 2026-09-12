import { useRebalance, useTax, useRisk } from '../hooks/useApi'
import { Card, Badge, Spinner } from './UI'
import { cn, formatINR } from '../utils/format'

function Narrative({ narrative }: { narrative: { summary?: string; points?: string[] } | null }) {
  if (!narrative) return null
  return (
    <div className="space-y-2 mt-1">
      {narrative.summary && (
        <p className="text-sm leading-relaxed text-foreground/90 border-l-2 border-indigo-400 pl-3">{narrative.summary}</p>
      )}
      {(narrative.points || []).slice(0, 4).map((p, i) => (
        <p key={i} className="text-xs text-muted-foreground">• {p}</p>
      ))}
    </div>
  )
}

function AllocationBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-14 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      <span className="text-xs font-mono w-16 text-right">{pct.toFixed(1)}%</span>
    </div>
  )
}

export function RebalanceCard() {
  const { data, isLoading, isError } = useRebalance()
  if (isLoading && !data) return <Card title="Allocation Check" className="h-full"><Spinner /></Card>
  if (isError || !data) return <Card title="Allocation Check" className="h-full"><p className="text-sm text-muted-foreground py-6 text-center">Rebalance data unavailable.</p></Card>
  const a = data.plan.allocation
  return (
    <Card title="Allocation Check" className="h-full">
      <div className="flex items-center justify-between mb-3">
        <Badge variant={data.ai_enabled ? 'green' : 'zinc'}>{data.ai_enabled ? 'AI advice' : 'Deterministic'}</Badge>
        {data.plan.category_concentration.top_category && (
          <span className="text-[11px] text-muted-foreground">
            Top: {data.plan.category_concentration.top_category} ({data.plan.category_concentration.top_category_share_pct.toFixed(1)}%)
          </span>
        )}
      </div>
      <AllocationBar label="Equity" pct={a.equity_pct} color="#6366f1" />
      <AllocationBar label="Debt" pct={a.debt_pct} color="#f59e0b" />
      <AllocationBar label="PF" pct={a.pf_pct} color="#22c55e" />
      <div className="mt-3 text-xs text-muted-foreground">
        {a.equity_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} equity ·{' '}
        {a.debt_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} debt ·{' '}
        {a.pf_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} PF
      </div>
      <Narrative narrative={data.narrative} />
    </Card>
  )
}

export function TaxCard() {
  const { data, isLoading, isError } = useTax()
  if (isLoading && !data) return <Card title="Tax Snapshot" className="h-full"><Spinner /></Card>
  if (isError || !data) return <Card title="Tax Snapshot" className="h-full"><p className="text-sm text-muted-foreground py-6 text-center">Tax data unavailable.</p></Card>
  const s = data.summary
  const over = s.equity_ltcg_vs_exemption_excess > 0
  return (
    <Card title="Tax Snapshot" className="h-full">
      <div className="flex items-center justify-between mb-3">
        <Badge variant={data.ai_enabled ? 'green' : 'zinc'}>{data.ai_enabled ? 'AI advice' : 'Deterministic'}</Badge>
        <Badge variant={over ? 'amber' : 'green'}>
          {over ? `${formatINR(s.equity_ltcg_vs_exemption_excess)} taxable` : 'LTCG sheltered'}
        </Badge>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total unrealised gain</span>
          <span className="font-mono">{formatINR(s.total_unrealized_gain)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Equity LTCG</span>
          <span className="font-mono">{formatINR(s.equity_ltcg_gain)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Exemption left</span>
          <span className="font-mono">{formatINR(s.equity_ltcg_exemption_remaining)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">STCG</span>
          <span className="font-mono">{formatINR(s.stcg_gain)}</span>
        </div>
      </div>
      <Narrative narrative={data.narrative} />
    </Card>
  )
}

export function RiskCard() {
  const { data, isLoading, isError } = useRisk()
  if (isLoading && !data) return <Card title="Portfolio Risk" className="h-full"><Spinner /></Card>
  if (isError || !data) return <Card title="Portfolio Risk" className="h-full"><p className="text-sm text-muted-foreground py-6 text-center">Risk data unavailable.</p></Card>
  const tierCls = {
    low: 'text-emerald-600 dark:text-emerald-400',
    medium: 'text-amber-600 dark:text-amber-400',
    high: 'text-rose-600 dark:text-rose-400',
  }[data.tier]
  return (
    <Card title="Portfolio Risk" className="h-full">
      <div className="flex items-end justify-between mb-3">
        <span className={cn('text-3xl font-bold leading-none', tierCls)}>{data.portfolio_risk.toFixed(0)}</span>
        <Badge variant={data.tier === 'high' ? 'red' : data.tier === 'medium' ? 'amber' : 'green'}>
          {data.tier} risk
        </Badge>
      </div>
      <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
        <p>Equity share: <span className="font-mono">{data.equity_share_pct.toFixed(1)}%</span></p>
        <p>Top holding: <span className="font-mono">{data.top_holding_share_pct.toFixed(1)}%</span> of corpus</p>
        {data.underwater_count > 0 && <p>Underwater: <span className="font-mono">{data.underwater_count}</span> holding(s)</p>}
      </div>
      <Narrative narrative={data.narrative} />
    </Card>
  )
}