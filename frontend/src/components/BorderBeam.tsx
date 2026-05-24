import { cn } from '../utils/format'

interface BorderBeamProps {
  className?: string
  /** Width of the moving beam element in px */
  size?: number
  /** Time in seconds for one full loop */
  duration?: number
  colorFrom?: string
  colorTo?: string
  /** Negative animation-delay offset in seconds (starts beam mid-loop) */
  delay?: number
  /** Border radius of the parent card in px — must match the card's rounding */
  borderRadius?: number
}

/**
 * A moving highlight that travels around the card border via CSS offset-path.
 * Drop inside any `relative overflow-hidden` container.
 */
export function BorderBeam({
  className,
  size = 150,
  duration = 8,
  colorFrom = 'var(--indigo)',
  colorTo = 'transparent',
  delay = 0,
  borderRadius = 12,
}: BorderBeamProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 block overflow-hidden', className)}
      style={{ borderRadius }}
    >
      <span
        style={{
          display: 'block',
          position: 'absolute',
          width: size,
          height: 2,
          top: 0,
          left: 0,
          background: `linear-gradient(to right, ${colorTo}, ${colorFrom}, ${colorTo})`,
          offsetPath: `inset(0 round ${borderRadius}px)`,
          offsetDistance: '0%',
          animationName: 'border-beam',
          animationDuration: `${duration}s`,
          animationDelay: delay ? `${-delay}s` : '0s',
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
        } as React.CSSProperties}
      />
    </span>
  )
}
