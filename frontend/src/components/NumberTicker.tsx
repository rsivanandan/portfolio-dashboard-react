import { useEffect, useRef, useState } from 'react'
import { cn } from '../utils/format'

interface NumberTickerProps {
  value: number
  formatter?: (val: number) => string
  duration?: number
  className?: string
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

/**
 * Animates a number from its previous value to the new one with easing.
 * Pass a `formatter` to control display (e.g. formatINR, formatPct).
 */
export function NumberTicker({ value, formatter, duration = 1400, className }: NumberTickerProps) {
  const [current, setCurrent] = useState(0)
  const animRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const fromRef = useRef(0)

  useEffect(() => {
    fromRef.current = current
    startRef.current = null
    if (animRef.current) cancelAnimationFrame(animRef.current)

    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutExpo(progress)
      setCurrent(fromRef.current + (value - fromRef.current) * eased)
      if (progress < 1) animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  const display = formatter ? formatter(current) : current.toFixed(0)
  return <span className={cn('tabular-nums', className)}>{display}</span>
}
