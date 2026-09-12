import { useAIInsights, type InsightText, type AIInsightsMetrics } from '../hooks/useApi'
import { Card, Badge, Spinner } from './UI'
import { formatINR, formatPct, cn } from '../utils/format'
import { IconAlertTriangle, IconBulb, IconSparkles } from '@tabler/icons-react'

function InsightRow({ item, tone }: { item: InsightText; tone: 'indigo' | 'amber' }) {
  const Icon = tone === 'amber' ? IconAlertTriangle : IconBulb
  return (
    <div className={cn(
      'flex gap-2.5 rounded-lg border p-3',
      tone === 'amber'
        ? 'border-amber-200/70 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/30'
        : 'border-indigo-200/70 bg-indigo-50/30 dark:border-indigo-900/60 dark:bg-indigo-950/30',
    )}>
      <Icon className={cn(
        'w-4 h-4 mt-0.5 shrink-0',
        tone === 'amber' ? 'text-amber-500 dark:text-amber-400' : 'text-indigo-500 dark:text-indigo-400',
      )} />
      <div className="text-sm space-y-0.5">
        <div className="font-semibold text-foreground">{item.title}</div>
        {item.detail && <div className="text-muted-foreground text-[13px] leading-relaxed">{item.detail}</div>}
      </div>
    </div>
  )
}

// Deterministic fallback rendered when the LLM is not configured/available —
// the numbers are real; only the narration is missing.
function DeterministicFacts({ m }: { m: AIInsightsMetrics }) {
  return (
    <div className="space-y-3">
      <InsightRow
        item={{ title: 'Concentration', detail: `Top fund is ${formatPct(m.top_holding_share_pct)} of your mutual fund value.` }}
        tone="indigo"
      />
      {m.stale_nav_count > 0 && (
        <InsightRow
          item={{
            title: 'Stale NAVs',
            detail: `${m.stale_nav_count} fund${m.stale_nav_count > 1 ? 's' : ''} have NAVs older than 5 days${m.stale_nav_funds.length ? ` (${m.stale_nav_funds.slice(0, 3).join(', ')})` : ''} — refresh NAVs for accurate totals.`,
          }}
          tone="amber"
        />
      )}
      {m.biggest_laggards.map((l) => (
        <InsightRow key={l.name} item={{ title: `${l.name} down ${formatPct(l.ret_pct)}`, detail: 'Worst performing holding by return.' }} tone="amber" />
      ))}
      {m.biggest_gainers.slice(0, 2).map((g) => (
        <InsightRow key={g.name} item={{ title: `${g.name} up ${formatPct(g.ret_pct)}`, detail: 'Best performing holding by return.' }} tone="indigo" />
      ))}
    </div>
  )
}

export default function InsightsPanel() {
  const { data, isLoading, isError } = useAIInsights()

  return (
    <Card title="AI Portfolio Insights" className="h-full" beam>
      <div className="flex items-center justify-between mb-3">
        <Badge variant={data?.ai_enabled ? 'green' : data ? 'amber' : 'zinc'}>
          {data?.ai_enabled ? 'AI narrated' : data ? 'Deterministic' : 'Unavailable'}
        </Badge>
        <span className="flex items-center gap-1 text-muted-foreground text-[11px] uppercase tracking-wider">
          <IconSparkles className="w-3.5 h-3.5" /> computed locally
        </span>
      </div>

      {isLoading && !data ? (
        <Spinner />
      ) : isError || !data ? (
        <div className="text-sm text-muted-foreground py-6 text-center">
          Insights unavailable right now.
        </div>
      ) : (
        <div className="space-y-4">
          {data.summary && (
            <p className="text-sm leading-relaxed text-foreground/90">{data.summary}</p>
          )}

          {data.ai_enabled ? (
            <>
              {data.insights.length > 0 && (
                <div className="space-y-2.5">
                  {data.insights.map((ins, i) => <InsightRow key={i} item={ins} tone="indigo" />)}
                </div>
              )}
              {data.risks.length > 0 && (
                <div className="space-y-2.5">
                  {data.risks.map((r, i) => <InsightRow key={i} item={r} tone="amber" />)}
                </div>
              )}
            </>
          ) : (
            <DeterministicFacts m={data.metrics} />
          )}

          <div className="text-[11px] text-muted-foreground pt-2 border-t border-border flex flex-wrap gap-x-4 gap-y-1">
            <span>Invested {formatINR(data.metrics.totals.total_invested)}</span>
            <span>Value {formatINR(data.metrics.totals.total_now)}</span>
            <span>{formatPct(data.metrics.overall_return_pct)} overall</span>
            <span>{data.metrics.mf_count} funds · {data.metrics.stock_count} stocks</span>
          </div>
        </div>
      )}
    </Card>
  )
}