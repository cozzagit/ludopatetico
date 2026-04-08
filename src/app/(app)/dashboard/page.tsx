'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { BarChart3, Target, TrendingUp, Trophy, Zap, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { MatchCard } from '@/src/components/match/match-card';

interface Stats {
  result1x2: { correct: number; total: number; percentage: number };
  over25: { correct: number; total: number; percentage: number };
  over35: { correct: number; total: number; percentage: number };
  btts: { correct: number; total: number; percentage: number };
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, matchesRes] = await Promise.all([
          fetch('/api/predictions/stats'),
          fetch('/api/matches/upcoming?limit=10'),
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData.data || statsData);
        }
        if (matchesRes.ok) {
          const matchesData = await matchesRes.json();
          setMatches(Array.isArray(matchesData) ? matchesData : matchesData.data || []);
        }
      } catch {
        // Silently handle fetch errors
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const user = session?.user as any;

  const s = stats as any;
  const statCards = s
    ? [
        { label: '1X2', value: (s.result1x2 || s.r1x2)?.percentage ?? 0, total: (s.result1x2 || s.r1x2)?.total ?? 0, color: 'var(--violet)', icon: Target },
        { label: 'Over 2.5', value: (s.resultOver25 || s.over25)?.percentage ?? 0, total: (s.resultOver25 || s.over25)?.total ?? 0, color: 'var(--emerald)', icon: TrendingUp },
        { label: 'Over 3.5', value: (s.resultOver35 || s.over35)?.percentage ?? 0, total: (s.resultOver35 || s.over35)?.total ?? 0, color: 'var(--blue)', icon: BarChart3 },
        { label: 'BTTS', value: (s.resultBtts || s.btts)?.percentage ?? 0, total: (s.resultBtts || s.btts)?.total ?? 0, color: 'var(--gold)', icon: Trophy },
      ]
    : [];

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-extrabold">
          Bentornato{user?.name ? `, ${user.name}` : ''} <span className="text-[var(--violet)]">&#x1F3C6;</span>
        </h1>
        <p className="text-[var(--text-secondary)] mt-1">
          Panoramica pronostici e prossime partite
        </p>
      </div>

      {/* Accuracy Stats */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--violet)]" />
        </div>
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((card, i) => {
                const Icon = card.icon;
                return (
                  <div key={i} className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-[var(--text-muted)]">{card.label}</span>
                      <Icon className="w-4 h-4" style={{ color: card.color }} />
                    </div>
                    <div className="text-3xl font-extrabold tabular-nums" style={{ color: card.color }}>
                      {card.value.toFixed(1)}%
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-1">
                      su {card.total} pronostici
                    </div>
                    {/* Mini bar */}
                    <div className="mt-3 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${card.value}%`, backgroundColor: card.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!stats && (
            <div className="glass-card p-8 text-center">
              <Zap className="w-10 h-10 text-[var(--violet)] mx-auto mb-3" />
              <h3 className="font-bold text-lg mb-2">Nessuna statistica disponibile</h3>
              <p className="text-[var(--text-secondary)] text-sm">
                Le statistiche appariranno quando saranno disponibili pronostici verificati.
              </p>
            </div>
          )}

          {/* Upcoming matches */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Prossime Partite</h2>
              <Link href="/matches" className="flex items-center gap-1 text-sm text-[var(--violet)] hover:text-[var(--violet)]/80 transition-colors">
                Tutte le partite <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {matches.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {matches.map(match => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            ) : (
              <div className="glass-card p-8 text-center">
                <Trophy className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                <h3 className="font-bold text-lg mb-2">Nessuna partita in programma</h3>
                <p className="text-[var(--text-secondary)] text-sm">
                  Le partite appariranno qui quando saranno sincronizzate.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
