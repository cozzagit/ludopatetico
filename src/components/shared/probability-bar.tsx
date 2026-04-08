'use client';

import { useEffect, useState } from 'react';

interface ProbabilityBarProps {
  label: string;
  value: number; // 0-100
  color?: string; // CSS color or gradient class
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  delay?: number;
}

const colorMap: Record<string, string> = {
  emerald: 'bg-[var(--emerald)]',
  gold: 'bg-[var(--gold)]',
  red: 'bg-[var(--red)]',
  violet: 'bg-[var(--violet)]',
  blue: 'bg-[var(--blue)]',
};

const heightMap = {
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
};

export function ProbabilityBar({
  label,
  value,
  color = 'emerald',
  size = 'md',
  showValue = true,
  delay = 0,
}: ProbabilityBarProps) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(value), delay + 100);
    return () => clearTimeout(timer);
  }, [value, delay]);

  const bgClass = colorMap[color] || color;
  const clampedValue = Math.min(100, Math.max(0, animated));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--text-secondary)]">{label}</span>
        {showValue && (
          <span className="text-sm font-semibold tabular-nums">{value.toFixed(1)}%</span>
        )}
      </div>
      <div className={`w-full rounded-full bg-[var(--border)] overflow-hidden ${heightMap[size]}`}>
        <div
          className={`${heightMap[size]} rounded-full transition-all duration-700 ease-out ${bgClass}`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
}

interface ThreeWayBarProps {
  homeValue: number;
  drawValue: number;
  awayValue: number;
  homeLabel?: string;
  drawLabel?: string;
  awayLabel?: string;
}

export function ThreeWayBar({
  homeValue,
  drawValue,
  awayValue,
  homeLabel = '1',
  drawLabel = 'X',
  awayLabel = '2',
}: ThreeWayBarProps) {
  return (
    <div className="space-y-3">
      <div className="flex rounded-lg overflow-hidden h-3">
        <div
          className="bg-[var(--emerald)] transition-all duration-700"
          style={{ width: `${homeValue}%` }}
        />
        <div
          className="bg-[var(--text-muted)] transition-all duration-700"
          style={{ width: `${drawValue}%` }}
        />
        <div
          className="bg-[var(--red)] transition-all duration-700"
          style={{ width: `${awayValue}%` }}
        />
      </div>
      <div className="flex justify-between text-sm">
        <div className="text-center">
          <span className="text-[var(--text-muted)]">{homeLabel}</span>
          <span className="ml-1.5 font-bold text-[var(--emerald)]">{homeValue.toFixed(1)}%</span>
        </div>
        <div className="text-center">
          <span className="text-[var(--text-muted)]">{drawLabel}</span>
          <span className="ml-1.5 font-bold text-[var(--text-secondary)]">{drawValue.toFixed(1)}%</span>
        </div>
        <div className="text-center">
          <span className="text-[var(--text-muted)]">{awayLabel}</span>
          <span className="ml-1.5 font-bold text-[var(--red)]">{awayValue.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
