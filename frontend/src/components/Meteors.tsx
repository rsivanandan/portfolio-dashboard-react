import { useMemo } from 'react'
import { cn } from '../utils/format'

interface MeteorsProps {
  /** Number of meteor streaks */
  count?: number
  className?: string
}

/**
 * Decorative meteor-shower effect. Requires the `meteor-fall` keyframe in index.css.
 * Drop inside a `relative overflow-hidden` container (e.g. the login card background).
 */
export function Meteors({ count = 14, className }: MeteorsProps) {
  const meteors = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        top: `${Math.floor(Math.random() * 100)}%`,
        left: `${Math.floor(Math.random() * 100)}%`,
        delay: `${(Math.random() * 4).toFixed(2)}s`,
        duration: `${(2.5 + Math.random() * 4).toFixed(2)}s`,
        opacity: (0.25 + Math.random() * 0.5).toFixed(2),
      })),
    // regenerate only when count changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count],
  )

  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {meteors.map((m) => (
        <span
          key={m.id}
          style={{
            position: 'absolute',
            height: '1px',
            width: '5rem',
            top: m.top,
            left: m.left,
            transform: 'rotate(215deg)',
            borderRadius: '9999px',
            background: 'linear-gradient(to right, rgba(255,255,255,0.75), transparent)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.06)',
            animationName: 'meteor-fall',
            animationDuration: m.duration,
            animationDelay: m.delay,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
            opacity: m.opacity,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
