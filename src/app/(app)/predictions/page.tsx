'use client';

import { useEffect, useState } from 'react';
import { Zap, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { CompetitionBadge } from '@/src/components/shared/competition-badge';

interface PredictionItem {
  id: string;
  matchId: number;
  predictedWinner: string;
  homeWinProbability: string;
  drawProbability: string;
  awayWinProbability: string;
  confidence: string;
  over25Probability?: string | null;
  bttsYesProbability?: string | null;
  isPremium: boolean;
  createdAt: string;
  match: {
    id: number;
    utcDate: string;
    status: string;
    homeTeam?: { name: string; shortName?: string | null; crest?: string | null } | null;
    awayTeam?: { name: string; shortName?: string | null; crest?: string | null } | null;
    competition?: { name: string; code: string } | null;
  };
}

function PredictionWinnerBadge({ winner }: { winner: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    HOME_TEAM: { label: '1', cls: 'bg-[var(--emerald)]/20 text-[var(--emerald)]' },
    DRAW: { label: 'X', cls: 'bg-[var(--gold)]/20 text-[var(--gold)]' },
    AWAY_TEAM: { label: '2', cls: 'bg-[var(--red)]/20 text-[var(--red)]' },
  };
  const c = config[winner] || { label: '?', cls: 'bg-[var(--border)] text-[var(--text-muted)]' };
  return <span className={`px-2.5 py-1 rounded-lg text-sm font-bold ${c.cls}`}>{c.label}</span>;
}

export default function PredictionsPage() {
  const [predictions, setPredictions] = useState<PredictionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/predictions');
        if (res.ok) {
          const data = await res.json();
          setPredictions(Array.isArray(data) ? data : data.data || []);
        }
      } catch {
        // Handle silently
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <Zap className="w-6 h-6 text-[var(--violet)]" />
          Pronostici Attivi
        </h1>
        <p className="text-[var(--text-secondary)] mt-1">Pronostici AI per le prossime partite</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--violet)]" />
        </div>
      ) : predictions.length > 0 ? (
        <div className="grid gap-3">
          {predictions.map(pred => {
            const m = pred.match;
            const date = new Date(m.utcDate);
            const dateStr = date.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
            const timeStr = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

            return (
              <Link key={pred.id} href={`/matches/${pred.matchId}`}
                className="glass-card p-4 hover:bg-[var(--card-hover)] transition-all group">
                <div className="flex items-center gap-4">
                  {/* Prediction badge */}
                  <PredictionWinnerBadge winner={pred.predictedWinner} />

                  {/* Match info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className="truncate">{m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}</span>
                      <span className="text-[var(--text-muted)]">vs</span>
                      <span className="truncate">{m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {m.competition && (
                        <CompetitionBadge name={m.competition.name} code={m.competition.code} size="sm" />
                      )}
                      <span className="text-xs text-[var(--text-muted)]">{dateStr} {timeStr}</span>
                    </div>
                  </div>

                  {/* Probabilities — always visible in compact format */}
                  <div className="flex items-center text-xs tabular-nums whitespace-nowrap font-bold">
                    <span className="text-[var(--emerald)]">{parseFloat(pred.homeWinProbability).toFixed(0)}%</span>
                    <span className="text-[var(--text-muted)] mx-0.5">/</span>
                    <span className="text-[var(--gold)]">{parseFloat(pred.drawProbability).toFixed(0)}%</span>
                    <span className="text-[var(--text-muted)] mx-0.5">/</span>
                    <span className="text-[var(--red)]">{parseFloat(pred.awayWinProbability).toFixed(0)}%</span>
                  </div>

                  {/* Confidence */}
                  <div className="text-right">
                    <div className="text-xs text-[var(--text-muted)]">Conf.</div>
                    <div className={`text-sm font-bold ${
                      parseFloat(pred.confidence) >= 70 ? 'text-[var(--emerald)]' :
                      parseFloat(pred.confidence) >= 50 ? 'text-[var(--gold)]' : 'text-[var(--text-secondary)]'
                    }`}>
                      {parseFloat(pred.confidence).toFixed(0)}%
                    </div>
                  </div>

                  {/* Premium badge */}
                  {pred.isPremium && (
                    <span className="px-2 py-0.5 rounded-full gradient-gold text-black text-xs font-bold">PRO</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="glass-card p-12 text-center">
          <Zap className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <h3 className="text-lg font-bold mb-2">Nessun pronostico attivo</h3>
          <p className="text-[var(--text-secondary)] text-sm">
            I pronostici appariranno quando le partite saranno sincronizzate e analizzate dall&apos;AI.
          </p>
        </div>
      )}
    </div>
  );
}
