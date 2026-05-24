import React from 'react'
import { cn } from '../utils/format'

interface AnimatedListProps {
  children: React.ReactNode
  className?: string
  /** Stagger delay between items in ms */
  delay?: number
  /** Delay before the first item in ms */
  initialDelay?: number
}

/**
 * Wraps children and animates each in with a staggered fade-up effect.
 * Requires the `fade-in-up` keyframe defined in index.css.
 */
export function AnimatedList({ children, className, delay = 120, initialDelay = 0 }: AnimatedListProps) {
  const items = React.Children.toArray(children)

  return (
    <div className={cn('flex flex-col', className)}>
      {items.map((child, i) => (
        <div
          key={i}
          style={{
            animationName: 'fade-in-up',
            animationDuration: '0.45s',
            animationDelay: `${initialDelay + i * delay}ms`,
            animationFillMode: 'both',
            animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}
