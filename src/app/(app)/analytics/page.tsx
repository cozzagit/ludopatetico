'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Loader2, BarChart3, Target, Activity } from 'lucide-react';

interface MarketAccuracy {
  market: string;
  label: string;
  correct: number;
  total: number;
  percentage: number;
}

interface CompetitionAccuracy {
  competitionId: number;
  name: string;
  code: string;
  correct: number;
  total: number;
  percentage: number;
}

interface AnalyticsData {
  markets: MarketAccuracy[];
  competitions: CompetitionAccuracy[];
  overall: { correct: number; total: number; percentage: number };
  recentTrend: number[]; // last 20 results, 1=correct 0=incorrect
}

function AccuracyBar({ label, percentage, total, color }: { label: string; percentage: number; total: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">{total} match</span>
          <span className="text-sm font-bold tabular-nums" style={{ color }}>
            {percentage.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function TrendDots({ results }: { results: number[] }) {
  return (
    <div className="flex items-center gap-1">
      {results.map((r, i) => (
        <div
          key={i}
          className={`w-2.5 h-2.5 rounded-full ${r === 1 ? 'bg-[var(--emerald)]' : 'bg-[var(--red)]'}`}
          title={r === 1 ? 'Corretto' : 'Errato'}
        />
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/predictions/analytics');
        if (res.ok) {
          const json = await res.json();
          setData(json.data);
        }
      } catch {
        // Handle silently
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--violet)]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-[var(--emerald)]" />
          Analytics
        </h1>
        <p className="text-[var(--text-secondary)] mt-1">Performance del sistema di pronostici AI</p>
      </div>

      {data ? (
        <>
          {/* Overall accuracy card */}
          <div className="glass-card p-6 text-center">
            <div className="text-sm text-[var(--text-muted)] mb-2">Accuratezza Complessiva (1X2)</div>
            <div className="text-5xl font-extrabold gradient-text-emerald">
              {data.overall.percentage.toFixed(1)}%
            </div>
            <div className="text-sm text-[var(--text-muted)] mt-2">
              {data.overall.correct} corretti su {data.overall.total} pronostici
            </div>

            {/* Recent trend */}
            {data.recentTrend.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-[var(--text-muted)] mb-2">Ultimi {data.recentTrend.length} pronostici</div>
                <div className="flex justify-center">
                  <TrendDots results={data.recentTrend} />
                </div>
              </div>
            )}
          </div>

          {/* Markets accuracy */}
          <div className="glass-card p-6">
            <h3 className="font-bold flex items-center gap-2 mb-5">
              <Target className="w-4 h-4 text-[var(--violet)]" />
              Accuratezza per Mercato
            </h3>
            <div className="space-y-4">
              {data.markets.map(m => {
                const color = m.percentage >= 60 ? 'var(--emerald)' : m.percentage >= 45 ? 'var(--gold)' : 'var(--red)';
                return (
                  <AccuracyBar key={m.market} label={m.label} percentage={m.percentage} total={m.total} color={color} />
                );
              })}
            </div>
          </div>

          {/* Competition accuracy */}
          {data.competitions.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="font-bold flex items-center gap-2 mb-5">
                <BarChart3 className="w-4 h-4 text-[var(--blue)]" />
                Accuratezza per Competizione
              </h3>
              <div className="space-y-4">
                {data.competitions
                  .sort((a, b) => b.percentage - a.percentage)
                  .map(c => {
                    const color = c.percentage >= 55 ? 'var(--emerald)' : c.percentage >= 40 ? 'var(--gold)' : 'var(--red)';
                    return (
                      <AccuracyBar key={c.competitionId} label={c.name} percentage={c.percentage} total={c.total} color={color} />
                    );
                  })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="glass-card p-12 text-center">
          <Activity className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <h3 className="text-lg font-bold mb-2">Dati insufficienti</h3>
          <p className="text-[var(--text-secondary)] text-sm">
            Le analytics saranno disponibili quando ci saranno abbastanza pronostici verificati.
          </p>
        </div>
      )}
    </div>
  );
}
