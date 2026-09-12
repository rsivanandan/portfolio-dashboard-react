import { useState } from 'react'
import { useScenario, useReport } from '../hooks/useApi'
import { Spinner } from './UI'
import { cn, formatINR, formatPct } from '../utils/format'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl p-5 shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ScenarioModal({ onClose }: { onClose: () => void }) {
  const [nifty, setNifty] = useState(0)
  const scenario = useScenario()
  const base = nifty ? scenario.data : null

  return (
    <Modal title="Scenario Simulator" onClose={onClose}>
      <p className="text-xs text-muted-foreground mb-4">
        Rerun your portfolio's market exposure assuming a given NIFTY move. Equity holdings track the index (beta 1.0); debt, PF and cash are unaffected for this simple shock.
      </p>

      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-foreground font-medium">NIFTY change</span>
          <span className="font-mono font-bold">{nifty > 0 ? '+' : ''}{nifty}%</span>
        </div>
        <input
          type="range" min={-30} max={30} value={nifty}
          onChange={(e) => setNifty(Number(e.target.value))}
          className="w-full accent-indigo-600"
        />
        <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
          <span>-30%</span><span>0</span><span>+30%</span>
        </div>
      </div>

      {scenario.isPending && <Spinner />}
      {scenario.isError && (
        <p className="text-sm text-rose-600 dark:text-rose-400">Simulation failed — try again.</p>
      )}

      {base && base.sim && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Portfolio today</div>
              <div className="font-mono">{formatINR(base.sim.total_before)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">After shock</div>
              <div className="font-mono">{formatINR(base.sim.total_after)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Change</div>
              <div className={cn('font-mono font-semibold', base.sim.delta_inr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                {base.sim.delta_inr >= 0 ? '+' : ''}{formatINR(base.sim.delta_inr)} ({formatPct(base.sim.delta_pct)})
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Exposure</div>
              <div className="font-mono">{formatINR(base.sim.equity_exposure)} equity / {formatINR(base.sim.debt_exposure)} cushion</div>
            </div>
          </div>

          {base.summary && (
            <p className="text-sm leading-relaxed text-foreground/90 border-l-2 border-indigo-400 pl-3">{base.summary}</p>
          )}
          {(base.points || []).map((p, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {p}</p>
          ))}
        </div>
      )}
    </Modal>
  )
}

type ReportRow = { name: string; label: string; value: number; fmt: 'inr' | 'pct' }

export function ReportModal({ onClose }: { onClose: () => void }) {
  const { data, isLoading, isError } = useReport()

  const rows: ReportRow[] = data ? [
    { name: 'invested', label: 'Total invested', value: data.metrics.totals.total_invested, fmt: 'inr' },
    { name: 'now', label: 'Current value', value: data.metrics.totals.total_now, fmt: 'inr' },
    { name: 'ret', label: 'Total returns', value: data.metrics.totals.total_now - data.metrics.totals.total_invested, fmt: 'inr' },
    { name: 'pct', label: 'Overall return', value: data.metrics.overall_return_pct, fmt: 'pct' },
  ] : []

  const download = () => {
    if (!data) return
    const lines = [
      `SAMRIDHI INVESTMENT REPORT — ${data.as_of}`,
      '',
      `Invested      ${formatINR(data.metrics.totals.total_invested)}`,
      `Value         ${formatINR(data.metrics.totals.total_now)}`,
      `Returns       ${formatINR(data.metrics.totals.total_now - data.metrics.totals.total_invested)} (${formatPct(data.metrics.overall_return_pct)})`,
      '',
      'ALLOCATION (target)',
      `  Equity ${data.rebalance.allocation.equity_pct.toFixed(1)}%  Debt ${data.rebalance.allocation.debt_pct.toFixed(1)}%  PF ${data.rebalance.allocation.pf_pct.toFixed(1)}%`,
      '',
      `RISK SCORE ${data.risk.portfolio_risk.toFixed(0)} (${data.risk.tier})`,
      '',
      'CAPITAL GAINS',
      `  Total unrealised      ${formatINR(data.tax.summary.total_unrealized_gain)}`,
      `  Equity LTCG           ${formatINR(data.tax.summary.equity_ltcg_gain)}`,
      `  STCG                  ${formatINR(data.tax.summary.stcg_gain)}`,
      '',
      'TOP STOCK MOVERS',
      ...Object.values(data.stocks).sort((a, b) => b.ret_pct - a.ret_pct).slice(0, 5).map((s) => `  ${s.Instrument.padEnd(3, ' ')}  ${s.now.toFixed(2)}  ${s.ret_pct >= 0 ? '+' : ''}${s.ret_pct.toFixed(2)}%`),
    ]
    if (data.narrative?.summary) {
      lines.push('', 'HIGHLIGHTS', `  ${data.narrative.summary}`)
      ;(data.narrative.points || []).forEach((p) => lines.push(`  • ${p}`))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `samridhi-report-${data.as_of}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal title={`Monthly Report — ${data?.as_of ?? '…'}`} onClose={onClose}>
      {isLoading && <Spinner />}
      {isError && <p className="text-sm text-rose-600 dark:text-rose-400">Could not load the report.</p>}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {rows.map((r) => (
              <div key={r.name} className="rounded-lg border border-border p-3">
                <div className="text-muted-foreground text-xs">{r.label}</div>
                <div className="font-mono font-semibold text-foreground">{r.fmt === 'inr' ? formatINR(r.value) : formatPct(r.value)}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="text-muted-foreground text-[11px] uppercase tracking-wider mb-2">Stocks — moves this month</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.values(data.stocks).sort((a, b) => b.ret_pct - a.ret_pct).slice(0, 8).map((s) => (
                <span key={s.Instrument} className={cn('text-xs font-mono px-2 py-0.5 rounded bg-muted border border-border', s.ret_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                  {s.Instrument} {s.ret_pct >= 0 ? '+' : ''}{s.ret_pct.toFixed(1)}%
                </span>
              ))}
            </div>
          </div>

          {data.rebalance.category_concentration?.top_category && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <span className="text-muted-foreground">Largest category: </span>
              <span className="text-foreground font-medium">{data.rebalance.category_concentration.top_category}</span>
              <span className="text-muted-foreground"> — {data.rebalance.category_concentration.top_category_share_pct.toFixed(1)}% of corpus</span>
            </div>
          )}

          {data.narrative && data.narrative.summary && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Highlights</div>
              <p className="text-sm leading-relaxed text-foreground/90 border-l-2 border-indigo-400 pl-3">{data.narrative.summary}</p>
              {(data.narrative.points || []).map((p, i) => (
                <p key={i} className="text-xs text-muted-foreground">• {p}</p>
              ))}
            </div>
          )}

          <button
            onClick={download}
            className="w-full px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500"
          >
            Download as .txt
          </button>
        </div>
      )}
    </Modal>
  )
}