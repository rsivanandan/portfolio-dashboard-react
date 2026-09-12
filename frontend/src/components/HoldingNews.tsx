import { useHoldingNews, useMutualFunds, useStocks, useHoldingDeepDive } from '../hooks/useApi'
import type { DeepDiveResponse } from '../hooks/useApi'
import { Card, Badge, Spinner } from './UI'
import { cn, formatINR, formatPct } from '../utils/format'
import { useState } from 'react'

// "Holding News" — N2/N3: headlines auto-matched to holdings you own.
// Without a key, matched items are returned raw (ai_enabled: false).
export default function HoldingNews() {
  const { data, isLoading, isError } = useHoldingNews()
  const { data: allMF } = useMutualFunds()
  const { data: allStocks } = useStocks()
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<string>('')
  const deepDive = useHoldingDeepDive()
  const [result, setResult] = useState<DeepDiveResponse | null>(null)

  const options = [
    ...(allStocks || []).map((s) => ({ entity: 'stocks', key: s.Ticker, label: `${s.Ticker} · Stock` })),
    ...(allMF || []).map((f) => ({ entity: 'mf', key: String(f.Fund_Name), label: `${f.Fund_Name} · MF` })),
  ]

  const run = async () => {
    const [entity, key] = sel.split('::')
    if (!entity || !key) return
    const res = await deepDive.mutateAsync({ entity, key })
    setResult(res)
  }

  if (isLoading && !data) return <Card title="Holding News"><Spinner /></Card>
  if (isError || !data) return <Card title="Holding News"><p className="text-sm text-muted-foreground py-4 text-center">Holding news unavailable right now.</p></Card>

  return (
    <Card title="Holding News" className="h-full">
      <div className="flex items-center justify-between mb-3">
        <Badge variant={data.ai_enabled ? 'green' : 'zinc'}>
          {data.ai_enabled ? 'AI distilled' : 'Matched headlines'}
        </Badge>
        <button
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Deep dive →
        </button>
      </div>

      {data.matches.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No news matched your holdings yet.</p>
      ) : (
        <ul className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {data.matches.slice(0, 12).map((m, i) => {
            const Wrapper = m.url ? 'a' : 'div'
            return (
              <li key={i} className="flex flex-col gap-1">
                <Wrapper
                  {...(m.url ? { href: m.url, target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="text-sm leading-snug font-medium group"
                >
                  <span className={cn('group-hover:text-indigo-400 transition-colors')}>{m.title}</span>
                </Wrapper>
                <div className="flex flex-wrap gap-1.5">
                  {[m.related, m.source].filter(Boolean).map((t, j) => (
                    <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground">
                      {t}
                    </span>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-lg bg-card border border-border rounded-xl p-5 shadow-xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Holding Deep Dive</h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
            </div>

            <select
              value={sel}
              onChange={(e) => { setSel(e.target.value); setResult(null) }}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground"
            >
              <option value="">Choose a holding…</option>
              {options.map((o) => (
                <option key={`${o.entity}::${o.key}`} value={`${o.entity}::${o.key}`}>{o.label}</option>
              ))}
            </select>

            <button
              onClick={run}
              disabled={!sel || deepDive.isPending}
              className="mt-3 w-full px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {deepDive.isPending ? 'Analysing…' : 'Analyse holding'}
            </button>

            {deepDive.isError && (
              <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">Could not run the deep dive.</p>
            )}

            {result && result.metrics && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{result.metrics.name}</span>
                  <Badge variant="zinc">{result.metrics.category || ''}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Invested</div>
                    <div className="font-mono">{formatINR(result.metrics.invested)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Current</div>
                    <div className="font-mono">{formatINR(result.metrics.now)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Return</div>
                    <div className={cn('font-mono', (result.metrics.ret_pct ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                      {formatPct(result.metrics.ret_pct)}
                    </div>
                  </div>
                  {result.metrics.vs_peer_pct != null && result.metrics.vs_peer_pct !== 0 && (
                    <div>
                      <div className="text-muted-foreground text-xs">vs category</div>
                      <div className="font-mono">{result.metrics.vs_peer_pct > 0 ? '+' : ''}{result.metrics.vs_peer_pct.toFixed(2)}%</div>
                    </div>
                  )}
                </div>
                {result.summary && (
                  <p className="text-sm leading-relaxed text-foreground/90 border-l-2 border-indigo-400 pl-3">{result.summary}</p>
                )}
                {(result.points || []).map((p, i) => (
                  <p key={i} className="text-sm text-muted-foreground">• {p}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}