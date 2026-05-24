import React from 'react';

interface XIRRCardProps {
  value: number | null;
  label?: string;
  accent?: 'blue' | 'green' | 'amber' | 'indigo' | 'rose';
}

export function XIRRCard({ value, label = 'XIRR (Annualized Return)', accent = 'indigo' }: XIRRCardProps) {
  const border = {
    blue: 'border-t-blue-500',
    green: 'border-t-emerald-500',
    amber: 'border-t-amber-500',
    indigo: 'border-t-indigo-500',
    rose: 'border-t-rose-500',
  }[accent];
  return (
    <div
      className={`bg-card border border-border rounded-xl p-5 border-t-2 transition-all hover:-translate-y-0.5 hover:shadow-md ${border}`}
    >
      <div className="text-muted-foreground text-xs font-semibold tracking-widest uppercase mb-2 font-mono">{label}</div>
      <div className="text-foreground text-2xl font-bold tracking-tight font-mono">
        {value !== null ? `${(value * 100).toFixed(2)}%` : '—'}
      </div>
    </div>
  );
}
