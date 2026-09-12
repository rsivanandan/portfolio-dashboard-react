import { useRetirementAI } from '../hooks/useApi'
import { Card, Badge, Spinner } from './UI'
import { formatINR } from '../utils/format'

// I6: AI layman's narrative on top of the deterministic retirement readiness
// engine. Degrades to the deterministic answer when no LLM key is present.
export default function RetirementReadinessAI() {
  const { data, isLoading, isError } = useRetirementAI()

  if (isLoading && !data) return <Card title="Retirement Check"><Spinner /></Card>
  if (isError || !data) return <Card title="Retirement Check"><p className="text-sm text-muted-foreground py-6 text-center">Retirement check unavailable.</p></Card>

  const badge = data.readiness === 'on-track'
    ? <Badge variant="green">On track</Badge>
    : data.readiness === 'gap'
    ? <Badge variant="red">Gap</Badge>
    : <Badge variant="amber">In progress</Badge>

  return (
    <Card title="Retirement Check">
      <div className="flex items-center justify-between mb-4">
        {badge}
        {data.refill.topup > 0 && (
          <span className="text-xs text-muted-foreground">
            Top-up needed: <span className="font-mono font-semibold text-foreground">{formatINR(data.refill.topup)}</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {data.buckets.map((b) => {
          const filled = b.filled_pct ?? 0
          const color = filled >= 90 ? '#22c55e' : filled >= 50 ? '#f59e0b' : '#f43f5e'
          return (
            <div key={b.name} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium capitalize text-foreground">{b.name}</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {b.target == null ? '—' : `${filled.toFixed(0)}%`}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
                <div className="h-full rounded-full" style={{ width: `${Math.min(filled, 100)}%`, background: color }} />
              </div>
              <div className="text-[11px] text-muted-foreground font-mono">
                {formatINR(b.actual)}{b.target != null && <span> / {formatINR(b.target)}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {data.years_covered.safety != null && (
        <p className="text-xs text-muted-foreground mb-3">
          Safety bucket covers <span className="font-mono">{data.years_covered.safety.toFixed(1)} yr</span> of expenses; growth covers{' '}
          <span className="font-mono">{data.years_covered.growth != null ? data.years_covered.growth.toFixed(1) + ' yr' : '—'}</span>.
        </p>
      )}

      {data.narrative && (
        <div className="space-y-2">
          {data.narrative.summary && (
            <p className="text-sm leading-relaxed text-foreground/90 border-l-2 border-indigo-400 pl-3">{data.narrative.summary}</p>
          )}
          {(data.narrative.points || []).map((p, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {p}</p>
          ))}
        </div>
      )}
    </Card>
  )
}