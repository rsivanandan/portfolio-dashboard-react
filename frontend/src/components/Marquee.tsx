import { useMarketTicker } from '../hooks/useApi'

export default function Marquee() {
  const { data } = useMarketTicker()

  if (!data?.length)
    return (
      <div className="h-9 bg-card/80 backdrop-blur-sm border-b border-border flex items-center px-4">
        <span className="text-muted-foreground text-xs font-mono animate-pulse">Loading market data…</span>
      </div>
    )

  const items = data.map((d) => {
    const pos = d.change >= 0
    return (
      <span key={d.label} className="inline-flex items-center gap-1.5 mx-6">
        <span className="text-muted-foreground text-xs font-semibold">{d.label}</span>
        <span className={`text-xs font-mono font-bold ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {d.value.toLocaleString('en-IN')}
          <span className="ml-1">
            {pos ? '▲' : '▼'} {Math.abs(d.change).toFixed(2)}%
          </span>
        </span>
      </span>
    )
  })

  const content = [...items, ...items]

  return (
    <div className="h-9 bg-card/80 backdrop-blur-sm border-b border-border overflow-hidden flex items-center">
      <style>{`
        @keyframes marquee { 0% { transform: translateX(0) } 100% { transform: translateX(-50%) } }
        .marquee-inner { animation: marquee 40s linear infinite; }
        .marquee-inner:hover { animation-play-state: paused; }
      `}</style>
      <div className="marquee-inner flex whitespace-nowrap" aria-label="Market ticker" role="marquee">{content}</div>
    </div>
  )
}
