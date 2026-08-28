import { useEffect, useMemo, useState } from 'react'
import {
  useRetirement, useUpdateRetirementConfig, useAssignBucket,
  type BucketName, type BucketHolding, type BucketSlice, type RetirementConfig, type RefillSignal,
} from '../hooks/useApi'
import { Spinner, Card, PageHeader, Table, Btn } from '../components/UI'
import { useToast } from '../components/Toast'
import { formatINR, cn } from '../utils/format'
import { IconCash, IconShieldHalf, IconTrendingUp } from '@tabler/icons-react'
import { AnimatedList } from '../components/AnimatedList'

const BUCKET_META: Record<BucketName, {
  title: string
  subtitle: string
  icon: typeof IconCash
  bar: string
  text: string
  chip: string
}> = {
  cash: {
    title: 'Bucket 1 — Cash',
    subtitle: 'Near-term living money — PF & cash on hand',
    icon: IconCash,
    bar: 'bg-gradient-to-r from-sky-500 to-cyan-400',
    text: 'text-sky-600 dark:text-sky-400',
    chip: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-400 dark:border-sky-900',
  },
  safety: {
    title: 'Bucket 2 — Safety',
    subtitle: 'Low-volatility assets: debt funds',
    icon: IconShieldHalf,
    bar: 'bg-gradient-to-r from-violet-500 to-purple-400',
    text: 'text-violet-600 dark:text-violet-400',
    chip: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-400 dark:border-violet-900',
  },
  growth: {
    title: 'Bucket 3 — Growth',
    subtitle: 'Equity engine — where the compounding happens',
    icon: IconTrendingUp,
    bar: 'bg-gradient-to-r from-emerald-500 to-teal-400',
    text: 'text-emerald-600 dark:text-emerald-400',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900',
  },
}

function BucketCard({
  bucket, actual, target, yearsCovered, yearsLabel, slices,
}: {
  bucket: BucketName
  actual: number
  target: number | null
  yearsCovered: number | null
  yearsLabel?: string
  slices: BucketSlice[]
}) {
  const meta = BUCKET_META[bucket]
  const Icon = meta.icon
  const pct = target && target > 0 ? Math.min((actual / target) * 100, 100) : null
  const gap = target != null ? actual - target : null
  const short = gap != null && gap < -0.01
  // Targets are corpus-derived, so within normal settings these buckets are
  // always exactly full — the meaningful signal is WHAT fills them: equity
  // spilling into a safe bucket means there aren't enough safe assets.
  const equityBacked = target != null
    ? slices.filter((s) => s.priority === 'growth').reduce((sum, s) => sum + s.amount, 0)
    : 0

  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Icon size={18} className={meta.text} aria-hidden="true" />
            <span className="text-[13px] font-semibold text-foreground uppercase tracking-wide">{meta.title}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">{meta.subtitle}</div>
        </div>
        {yearsLabel && (
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border shrink-0', meta.chip)}>
            {yearsLabel}
          </span>
        )}
      </div>

      <div className="text-2xl font-bold text-foreground mb-0.5">{formatINR(actual)}</div>
      {target != null ? (
        <div className="text-xs text-muted-foreground mb-3">
          Target {formatINR(target)}
          {short ? (
            <span className="ml-2 font-semibold text-rose-600 dark:text-rose-400">
              ▼ {formatINR(-(gap as number))} short — corpus can't fill this bucket
            </span>
          ) : equityBacked > 0.01 ? (
            <span className="ml-2 font-semibold text-amber-600 dark:text-amber-400">
              ⚠ {formatINR(equityBacked)} backed by equity — consider de-risking
            </span>
          ) : (
            <span className="ml-2 font-semibold text-emerald-600 dark:text-emerald-400">
              ✓ fully backed by safe assets
            </span>
          )}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground mb-3">
          No target — everything beyond Buckets 1 & 2 grows here
        </div>
      )}

      <div className="relative h-3 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-700', meta.bar)}
          style={{ width: `${pct ?? 100}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground font-mono">
        <span>{pct != null ? `${pct.toFixed(1)}% funded` : 'holds all overflow'}</span>
        {yearsCovered != null && (
          <span>≈ {yearsCovered.toFixed(1)} {pct != null ? 'yrs covered' : 'more yrs even at 0% growth'}</span>
        )}
      </div>
    </Card>
  )
}

function ConfigCard({ config }: { config: RetirementConfig }) {
  const { toast } = useToast()
  const update = useUpdateRetirementConfig()
  const [swr, setSwr] = useState(config.swr_pct)
  const [infl, setInfl] = useState(config.inflation_pct)
  const [cash, setCash] = useState(String(config.cash_amount || ''))
  const [b1Years, setB1Years] = useState(config.bucket1_years)
  const [b2Years, setB2Years] = useState(config.bucket2_years)

  useEffect(() => {
    setSwr(config.swr_pct)
    setInfl(config.inflation_pct)
    setCash(String(config.cash_amount || ''))
    setB1Years(config.bucket1_years)
    setB2Years(config.bucket2_years)
  }, [config])

  const dirty =
    swr !== config.swr_pct ||
    infl !== config.inflation_pct ||
    parseFloat(cash || '0') !== config.cash_amount ||
    b1Years !== config.bucket1_years ||
    b2Years !== config.bucket2_years

  const save = () => {
    update.mutate(
      {
        swr_pct: swr,
        inflation_pct: infl,
        cash_amount: parseFloat(cash || '0'),
        bucket1_years: b1Years,
        bucket2_years: b2Years,
        refill_trigger_years: config.refill_trigger_years,
      },
      {
        onSuccess: () => toast('Retirement plan saved', 'success'),
        onError: () => toast('Failed to save retirement plan', 'error'),
      },
    )
  }

  const inputCls =
    'w-full bg-transparent border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary'

  return (
    <Card title="Plan Settings">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4 items-end">
        <div>
          <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase mb-1.5">Withdrawal Rate</div>
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
            {[3.5, 4, 5].map((r) => (
              <button
                key={r}
                onClick={() => setSwr(r)}
                className={cn('px-3.5 py-2 transition-all', swr === r ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
              >
                {r}%
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase mb-1.5">Inflation</div>
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
            {[6, 7, 8].map((r) => (
              <button
                key={r}
                onClick={() => setInfl(r)}
                className={cn('px-3.5 py-2 transition-all', infl === r ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
              >
                {r}%
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="ret-cash" className="block text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase mb-1.5">
            Cash / FD on hand (₹)
          </label>
          <input id="ret-cash" type="number" min={0} value={cash} onChange={(e) => setCash(e.target.value)} className={inputCls} placeholder="Savings, FDs, liquid cash" />
        </div>
        <div>
          <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase mb-1.5">Bucket 1 Horizon</div>
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
            {[2, 3, 4].map((y) => (
              <button
                key={y}
                onClick={() => setB1Years(y)}
                className={cn('px-3.5 py-2 transition-all', b1Years === y ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
              >
                {y} yr
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase mb-1.5">Bucket 2 Horizon</div>
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
            {[3, 4, 5].map((y) => (
              <button
                key={y}
                onClick={() => setB2Years(y)}
                className={cn('px-3.5 py-2 transition-all', b2Years === y ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
              >
                {y} yr
              </button>
            ))}
          </div>
        </div>
        <div>
          <Btn onClick={save} loading={update.isPending} disabled={!dirty} variant="primary">
            Save Plan
          </Btn>
        </div>
      </div>
    </Card>
  )
}

// Plastic-bucket color kits — saturated "bathroom bucket" plastics
const BUCKET_PLASTIC: Record<BucketName, { body: string; rim: string; water: string; handle: string }> = {
  cash: {
    body: 'from-sky-300 via-sky-400 to-sky-600',
    rim: 'bg-gradient-to-b from-sky-500 to-sky-700',
    water: 'bg-sky-800',
    handle: 'border-sky-700/70',
  },
  safety: {
    body: 'from-violet-300 via-violet-400 to-violet-600',
    rim: 'bg-gradient-to-b from-violet-500 to-violet-700',
    water: 'bg-violet-900',
    handle: 'border-violet-700/70',
  },
  growth: {
    body: 'from-emerald-300 via-emerald-400 to-emerald-600',
    rim: 'bg-gradient-to-b from-emerald-500 to-emerald-700',
    water: 'bg-emerald-900',
    handle: 'border-emerald-800/70',
  },
}

// Tapered bucket silhouette (wider at the rim, narrower at the base)
const BUCKET_CLIP = 'polygon(0% 0%, 100% 0%, 88% 96%, 85% 100%, 15% 100%, 12% 96%)'

function BucketVisual({
  bucket, slices, actual, target, totalCorpus, yearsCovered,
}: {
  bucket: BucketName
  slices: BucketSlice[]
  actual: number
  target: number | null
  totalCorpus: number
  yearsCovered: number | null
}) {
  const meta = BUCKET_META[bucket]
  const Icon = meta.icon
  const plastic = BUCKET_PLASTIC[bucket]
  const share = totalCorpus > 0 ? (actual / totalCorpus) * 100 : 0
  // Targeted buckets fill up to their tenure target; growth shows corpus share
  const level = target != null && target > 0 ? Math.min((actual / target) * 100, 100) : share
  const full = target != null && target > 0 && actual >= target - 0.01

  return (
    <div className="flex flex-col items-center">
      {/* Handle */}
      <div
        className={cn('w-2/3 h-7 rounded-t-full border-t-4 border-x-4 -mb-2.5', plastic.handle)}
        aria-hidden="true"
      />

      {/* Rim — wider than the body, like a real bucket lip */}
      <div className={cn('w-full h-3 rounded-full shadow-md relative z-10', plastic.rim)} aria-hidden="true">
        <div className="absolute inset-x-3 top-[2px] h-[2px] rounded-full bg-white/30" />
      </div>

      {/* Body — fixed height so all three buckets are identical */}
      <div className="relative w-[95%] -mt-1" style={{ clipPath: BUCKET_CLIP }}>
        <div className={cn('relative flex flex-col h-[250px] bg-gradient-to-br', plastic.body)}>
          {/* Water — targeted buckets fill toward their target; growth shows corpus share */}
          <div
            className={cn('absolute inset-x-0 bottom-0 opacity-35 transition-all duration-700', plastic.water)}
            style={{ height: `${level}%` }}
            aria-hidden="true"
          />
          {!full && (
            <div
              className="absolute inset-x-0 h-1.5 rounded-[100%] bg-white/40 transition-all duration-700"
              style={{ bottom: `calc(${level}% - 3px)` }}
              aria-hidden="true"
            />
          )}

          {/* Plastic sheen + moulding ridges */}
          <div className="absolute left-[10%] top-0 bottom-0 w-[9%] bg-gradient-to-r from-white/50 via-white/20 to-transparent pointer-events-none" aria-hidden="true" />
          <div className="absolute inset-x-[16%] bottom-6 h-px bg-black/10 pointer-events-none" aria-hidden="true" />
          <div className="absolute inset-x-[15%] bottom-7 h-px bg-white/20 pointer-events-none" aria-hidden="true" />

          <div className="relative px-6 pt-3 pb-8 flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="flex items-center justify-center gap-1.5 mb-0.5">
              <Icon size={13} className="text-white drop-shadow shrink-0" aria-hidden="true" />
              <span className="text-[10px] font-bold text-white uppercase tracking-wider drop-shadow whitespace-nowrap">{meta.title}</span>
            </div>
            <div className="text-center mb-2">
              <span className="text-lg font-bold text-white drop-shadow-md">{formatINR(actual)}</span>
              {full && (
                <span className="block text-[10px] font-semibold font-mono text-white/90">● Full — overflow spills over</span>
              )}
            </div>

            {/* Contents — waterfall slices; a holding can straddle buckets */}
            {slices.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-white/80 italic">
                Empty — nothing has flowed here yet
              </div>
            ) : (
              <div className="space-y-1 flex-1 min-h-0 overflow-y-auto pr-1">
                {slices.map((s) => (
                  <div key={`${s.entity}-${s.key}`} className="flex items-center justify-between gap-2 text-[11px] px-2 py-0.5 rounded bg-white/25 backdrop-blur-[1px]">
                    <span className="text-white font-medium truncate drop-shadow-sm" title={s.partial ? `${s.name} (part of holding)` : s.name}>
                      {s.name}{s.partial && <span className="text-white/75 font-normal"> · part</span>}
                    </span>
                    <span className="font-mono text-white/90 shrink-0">{formatINR(s.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Base — share of corpus & years of spending it covers */}
            <div className="mt-auto pt-2 text-center text-[10px] text-white font-semibold font-mono drop-shadow-sm">
              {share.toFixed(1)}% of corpus
              {yearsCovered != null && (
                <span className="text-white/85">
                  {' '}· ≈ {yearsCovered} yr{yearsCovered !== 1 ? 's' : ''}{target == null ? ' @ 0% growth' : ' covered'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Refill strategy panel — sits beside the buckets ─────────────────────────
function RefillPanel({ refill, config }: { refill: RefillSignal; config: RetirementConfig }) {
  const { toast } = useToast()
  const update = useUpdateRetirementConfig()

  const setTrigger = (yrs: number) => {
    update.mutate(
      { ...config, refill_trigger_years: yrs },
      { onError: () => toast('Failed to save refill trigger', 'error') },
    )
  }

  const marketKnown = refill.market != null
  const fromGrowth = refill.source === 'growth'

  return (
    <div className="h-full rounded-xl border border-border bg-card/60 px-4 py-3.5 flex flex-col">
      <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
        Refill Strategy
      </div>
      <div className="text-[10.5px] text-muted-foreground leading-snug mt-0.5 mb-2">
        When Bucket 1 runs low, where does the top-up come from?
      </div>

      {/* Action status first — is anything due? */}
      <div className={cn(
        'text-[11px] leading-snug rounded-lg px-2.5 py-2 mb-2 border',
        refill.action_needed
          ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300'
          : 'border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400',
      )}>
        {refill.action_needed ? (
          <>⚠ Refill due: Bucket 1 is down to {refill.b1_years} yrs of spending — move {formatINR(refill.topup_amount)}{refill.source ? ` from ${refill.source === 'growth' ? 'Growth' : 'Safety'}` : ''} to refill it</>
        ) : (
          <>✓ Nothing to do — Bucket 1 holds {refill.b1_years ?? '—'} yrs of spending; refill only becomes due below {refill.trigger_years} yrs</>
        )}
      </div>

      {/* Market gate — which bucket funds the refill */}
      <div className="text-[11px] leading-snug mb-2.5">
        {marketKnown ? (
          <>
            <span className="text-foreground font-medium">
              {fromGrowth ? 'Source when due: Growth' : 'Source when due: Safety'}
            </span>
            <span className="block mt-0.5 text-muted-foreground">
              {fromGrowth
                ? <>markets are up (NIFTY <span className="font-mono text-emerald-600 dark:text-emerald-400">+{refill.nifty_12m_pct?.toFixed(1)}%</span> over 12m) — harvest equity gains</>
                : <>markets are down (NIFTY <span className="font-mono text-rose-600 dark:text-rose-400">{refill.nifty_12m_pct?.toFixed(1)}%</span> over 12m) — don't sell equity at a loss; draw on debt instead</>}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Market signal unavailable — source undetermined</span>
        )}
      </div>

      {/* The playbook — the standing rules, spelled out */}
      <div className="border-t border-border/60 pt-2 mb-2.5">
        <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground mb-1.5">The playbook</div>
        <ul className="space-y-1 text-[11px] leading-snug text-muted-foreground">
          <li><span className="text-emerald-600 dark:text-emerald-400 font-semibold">Markets up:</span> refill Bucket 1 by harvesting Growth gains; top up Bucket 2 too.</li>
          <li><span className="text-rose-600 dark:text-rose-400 font-semibold">Markets down:</span> refill from Bucket 2 (debt); leave equity untouched to recover.</li>
          <li><span className="text-amber-600 dark:text-amber-400 font-semibold">Long crash:</span> if Bucket 2 also runs dry, spend Bucket 1 down without refilling — that's what the {config.bucket1_years}+{config.bucket2_years} yrs of cover is for.</li>
        </ul>
      </div>

      {/* Trigger selector */}
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground leading-tight">Refill when Bucket 1 falls below</span>
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-[11px] shrink-0">
          {[1, 1.5, 2].map((y) => (
            <button
              key={y}
              onClick={() => setTrigger(y)}
              disabled={update.isPending}
              className={cn('px-2 py-1 transition-all', config.refill_trigger_years === y ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
            >
              {y} yr
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Retirement goal progress (moved from Dashboard) ─────────────────────────
const GOAL_RATES = [0.08, 0.10, 0.12, 0.14]
const GOAL_MONTHLY_KEY = 'retirement.targetMonthly'
const GOAL_RATE_KEY = 'retirement.rate'

function RetirementGoal({ corpus, swrPct }: { corpus: number; swrPct: number }) {
  const [rate, setRate] = useState<number>(() => {
    const stored = localStorage.getItem(GOAL_RATE_KEY)
    const v = stored ? parseFloat(stored) : NaN
    return GOAL_RATES.includes(v) ? v : GOAL_RATES[1]
  })
  const [targetMonthly, setTargetMonthly] = useState<number>(() => {
    const stored = localStorage.getItem(GOAL_MONTHLY_KEY)
    const v = stored ? parseFloat(stored) : NaN
    return Number.isFinite(v) && v > 0 ? Math.round(v) : 360_000
  })
  const swr = swrPct / 100
  // Accumulation phase is NOMINAL by design: the target monthly is the amount
  // to withdraw at retirement, not today's purchasing power. Inflation enters
  // only in the utilization phase — the bucket tenure targets handle it.
  const targetCorpus = targetMonthly > 0 && swr > 0 ? (targetMonthly * 12) / swr : 0
  const pct = targetCorpus > 0 ? Math.min((corpus / targetCorpus) * 100, 100) : 0
  const remaining = Math.max(targetCorpus - corpus, 0)
  const currentMonthly = (corpus * swr) / 12
  const yearsToGo = corpus > 0 && targetCorpus > corpus
    ? Math.log(targetCorpus / corpus) / Math.log(1 + rate)
    : 0

  return (
    <Card title="Retirement Goal">
      <div className="flex flex-col gap-5 pt-1">
        <div>
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">Current Corpus</div>
              <div className="text-2xl font-bold text-foreground">{formatINR(corpus)}</div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">Target</div>
              <div className="text-2xl font-bold text-foreground">{formatINR(targetCorpus)}</div>
              {yearsToGo > 0 && (
                <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                  ~{yearsToGo.toFixed(1)} yrs at {(rate * 100).toFixed(0)}%
                </div>
              )}
              {targetMonthly > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {formatINR(targetMonthly)}/mo withdrawal at retirement
                </div>
              )}
            </div>
          </div>
          <div className="relative h-3.5 rounded-full bg-muted overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-violet-400 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
            <div
              className="absolute inset-y-0 w-px bg-foreground/30"
              style={{ left: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground font-mono">
            <span>₹0</span>
            <span className="font-semibold text-foreground">{pct.toFixed(1)}% funded</span>
            <span>{formatINR(targetCorpus)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 border-t border-border/60 pt-4">
          {[
            { label: 'Current Value', value: formatINR(corpus) },
            { label: `Current Monthly (${swrPct}%)`, value: formatINR(currentMonthly) },
            { label: 'Target', value: formatINR(targetCorpus) },
            { label: 'Remaining', value: formatINR(remaining) },
          ].map((c) => (
            <div key={c.label}>
              <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase mb-1">{c.label}</div>
              <div className="text-lg font-bold text-foreground">{c.value}</div>
            </div>
          ))}
          <div>
            <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase mb-1">Target Monthly ({swrPct}%)</div>
            <div className="flex items-baseline gap-1 text-lg font-bold text-foreground">
              <span className="text-sm text-muted-foreground font-normal">₹</span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={targetMonthly > 0 ? (targetMonthly / 100000).toFixed(1) : ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  const next = Number.isFinite(v) && v > 0 ? Math.round(v * 100000) : 0
                  setTargetMonthly(next)
                  localStorage.setItem(GOAL_MONTHLY_KEY, String(next))
                }}
                className="w-16 bg-transparent border-b border-border focus:outline-none focus:border-primary text-right font-bold tabular-nums"
              />
              <span className="text-sm text-muted-foreground font-normal">L</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Projected return</span>
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
            {GOAL_RATES.map((r) => (
              <button
                key={r}
                onClick={() => { setRate(r); localStorage.setItem(GOAL_RATE_KEY, String(r)) }}
                className={cn(
                  'px-3 py-1 transition-all',
                  rate === r ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {(r * 100).toFixed(0)}%
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

// These set POUR ORDER, not final location — the waterfall decides where
// money actually lands, so labels must not promise a destination bucket.
const BUCKET_OPTIONS: { value: BucketName; label: string }[] = [
  { value: 'cash', label: 'Pours 1st' },
  { value: 'safety', label: 'Pours 2nd' },
  { value: 'growth', label: 'Pours last' },
]

function BucketSelect({ holding }: { holding: BucketHolding }) {
  const { toast } = useToast()
  const assign = useAssignBucket()
  return (
    <select
      value={holding.bucket}
      disabled={assign.isPending}
      aria-label={`Bucket for ${holding.name}`}
      onChange={(e) =>
        assign.mutate(
          { entity: holding.entity, key: holding.key, bucket: e.target.value as BucketName },
          { onError: () => toast('Failed to update bucket', 'error') },
        )
      }
      className="bg-card border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
    >
      {BUCKET_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

const ENTITY_LABEL: Record<BucketHolding['entity'], string> = {
  mf: 'Mutual Fund',
  stock: 'Stock',
  pf: 'PF',
}

export default function Retirement() {
  const { data, isLoading } = useRetirement()

  const holdings = useMemo(
    () => [...(data?.holdings ?? [])].sort((a, b) => b.value - a.value),
    [data],
  )

  if (isLoading || !data) return <Spinner />

  const { config, buckets } = data
  const annual = data.annual_affordable
  const totalCorpus = data.corpus

  return (
    <AnimatedList delay={150} className="space-y-6">
      <PageHeader
        title="Retirement Buckets"
        subtitle="Three-bucket strategy — spend from cash, refill from safety, grow the rest"
      />

      {/* Retirement goal progress */}
      <RetirementGoal corpus={totalCorpus} swrPct={config.swr_pct} />

      <ConfigCard config={config} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BucketCard
          bucket="cash"
          actual={buckets.cash.actual}
          target={buckets.cash.target}
          yearsCovered={buckets.cash.years_covered}
          yearsLabel={`Yrs 1–${config.bucket1_years}`}
          slices={buckets.cash.slices}
        />
        <BucketCard
          bucket="safety"
          actual={buckets.safety.actual}
          target={buckets.safety.target}
          yearsCovered={buckets.safety.years_covered}
          yearsLabel={`Yrs ${config.bucket1_years + 1}–${config.bucket1_years + config.bucket2_years}`}
          slices={buckets.safety.slices}
        />
        <BucketCard
          bucket="growth"
          actual={buckets.growth.actual}
          target={buckets.growth.target}
          yearsCovered={buckets.growth.years_covered}
          yearsLabel={`Yr ${config.bucket1_years + config.bucket2_years + 1}+`}
          slices={buckets.growth.slices}
        />
      </div>

      {/* Corpus split — waterfall: fill Bucket 1, overflow to 2, rest grows */}
      {totalCorpus > 0 && (
        <Card title="Corpus Split">
          <p className="text-xs text-muted-foreground -mt-1 mb-4 text-center">
            Money fills Bucket 1 to its inflation-adjusted tenure target first, overflows into Bucket 2 (covering the years after Bucket 1, inflated further), and the remainder compounds in Growth.
          </p>
          <div className="flex flex-col lg:flex-row items-center gap-6">
            {/* Left — total corpus */}
            <div className="lg:w-44 shrink-0 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/40 px-4 py-3.5 text-center">
              <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-indigo-700 dark:text-indigo-400">Total Corpus</div>
              <div className="mt-1 text-2xl font-bold leading-none text-indigo-700 dark:text-indigo-300">{formatINR(totalCorpus)}</div>
              <div className="mt-1.5 text-[11px] text-muted-foreground">pours into the buckets →</div>
            </div>

            {/* Buckets */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full flex-1">
              {(['cash', 'safety', 'growth'] as BucketName[]).map((b) => (
                <BucketVisual
                  key={b}
                  bucket={b}
                  slices={buckets[b].slices}
                  actual={buckets[b].actual}
                  target={buckets[b].target}
                  totalCorpus={totalCorpus}
                  yearsCovered={buckets[b].years_covered}
                />
              ))}
            </div>

            {/* Right — affordable spend (as before) */}
            <div className="lg:w-44 shrink-0 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/40 px-4 py-3.5 text-center">
              <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-emerald-700 dark:text-emerald-400">Affordable Spend</div>
              <div className="mt-1 text-2xl font-bold leading-none text-emerald-700 dark:text-emerald-300">{formatINR(data.monthly_affordable)}</div>
              <div className="mt-0.5 text-[11px] text-emerald-700/80 dark:text-emerald-400/80 font-medium">per month</div>
              <div className="mt-2 pt-2 border-t border-emerald-200/70 dark:border-emerald-900/70 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">per year</span>
                <span className="font-mono font-semibold text-foreground">{formatINR(annual)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">withdrawal</span>
                <span className="font-mono font-semibold text-foreground">{config.swr_pct}%/yr</span>
              </div>
            </div>

            {/* Far right — refill strategy, with room to explain itself */}
            <div className="lg:w-72 shrink-0 self-stretch">
              <RefillPanel refill={data.refill} config={config} />
            </div>
          </div>
        </Card>
      )}

      {/* Holdings assignment — sets pour priority for the waterfall */}
      <Card title="Fill Priority">
        <p className="text-xs text-muted-foreground -mt-1 mb-3">
          This sets the ORDER money pours into the waterfall, not its final bucket — a holding poured early can still overflow into later buckets once targets fill. Defaults: PF pours 1st, debt funds 2nd, equity last. Cash / FD entered above always pours before everything.
        </p>
        <Table
          data={holdings}
          columns={[
            { key: 'name', label: 'Holding', render: (r) => <span className="text-foreground text-xs font-medium">{r.name}</span> },
            { key: 'entity', label: 'Type', render: (r) => <span className="text-muted-foreground text-xs">{ENTITY_LABEL[r.entity]}</span> },
            { key: 'category', label: 'Category', render: (r) => <span className="text-muted-foreground text-xs">{r.category}</span> },
            { key: 'value', label: 'Value', align: 'right', render: (r) => <span className="font-mono text-xs">{formatINR(r.value)}</span> },
            { key: 'bucket', label: 'Pour Order', align: 'right', render: (r) => <BucketSelect holding={r} /> },
          ]}
        />
      </Card>
    </AnimatedList>
  )
}
