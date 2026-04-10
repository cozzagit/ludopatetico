'use client';

import { useEffect, useState } from 'react';
import { Clock, Loader2, CheckCircle2, XCircle, Minus, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { CompetitionBadge } from '@/src/components/shared/competition-badge';

interface HistoryItem {
  id: string;
  matchId: number;
  predictedWinner: string;
  homeWinProbability: string;
  drawProbability: string;
  awayWinProbability: string;
  confidence: string;
  actualResult?: string | null;
  isCorrect?: boolean | null;
  result1x2Correct?: boolean | null;
  resultOver25Correct?: boolean | null;
  resultBttsCorrect?: boolean | null;
  match: {
    id: number;
    utcDate: string;
    homeScore?: number | null;
    awayScore?: number | null;
    homeTeam?: { name: string; shortName?: string | null; crest?: string | null } | null;
    awayTeam?: { name: string; shortName?: string | null; crest?: string | null } | null;
    competition?: { name: string; code: string } | null;
  };
}

function ResultIcon({ correct }: { correct?: boolean | null }) {
  if (correct === true) return <CheckCircle2 className="w-5 h-5 text-[var(--emerald)]" />;
  if (correct === false) return <XCircle className="w-5 h-5 text-[var(--red)]" />;
  return <Minus className="w-5 h-5 text-[var(--text-muted)]" />;
}

function MarketResult({ label, correct }: { label: string; correct?: boolean | null }) {
  if (correct === null || correct === undefined) return null;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-medium whitespace-nowrap ${
      correct ? 'bg-[var(--emerald)]/10 text-[var(--emerald)]' : 'bg-[var(--red)]/10 text-[var(--red)]'
    }`}>
      {label}<span className="hidden sm:inline"> {correct ? 'OK' : 'NO'}</span><span className="sm:hidden">{correct ? '✓' : '✗'}</span>
    </span>
  );
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const perPage = 20;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/predictions/historical?limit=${perPage}`);
        if (res.ok) {
          const data = await res.json();
          setItems(Array.isArray(data) ? data : data.data || []);
          setHasMore((data.meta?.total || 0) > page * perPage);
        }
      } catch {
        // Handle silently
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [page]);

  const totalCorrect = items.filter(i => i.isCorrect === true).length;
  const totalVerified = items.filter(i => i.isCorrect !== null && i.isCorrect !== undefined).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <Clock className="w-6 h-6 text-[var(--gold)]" />
            Storico Pronostici
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">Risultati dei pronostici passati</p>
        </div>

        {totalVerified > 0 && (
          <div className="glass-card px-4 py-2 text-center">
            <div className="text-xs text-[var(--text-muted)]">Pagina corrente</div>
            <div className="text-lg font-bold text-[var(--emerald)]">
              {totalCorrect}/{totalVerified}
              <span className="text-sm text-[var(--text-muted)] ml-1">
                ({totalVerified > 0 ? ((totalCorrect / totalVerified) * 100).toFixed(0) : 0}%)
              </span>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--violet)]" />
        </div>
      ) : items.length > 0 ? (
        <>
          <div className="space-y-2">
            {items.map(item => {
              const m = item.match;
              const date = new Date(m.utcDate).toLocaleDateString('it-IT', {
                day: 'numeric', month: 'short', year: 'numeric',
              });

              return (
                <Link key={item.id} href={`/matches/${item.matchId}`}
                  className="glass-card p-4 flex items-center gap-4 hover:bg-[var(--card-hover)] transition-all group">
                  {/* Result indicator */}
                  <ResultIcon correct={item.isCorrect} />

                  {/* Match info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {m.homeTeam?.crest && <img src={m.homeTeam.crest} alt="" className="w-5 h-5 object-contain" />}
                      <span className="text-sm font-semibold truncate">{m.homeTeam?.shortName || m.homeTeam?.name}</span>
                      <span className="text-sm font-bold text-[var(--text-muted)] tabular-nums">
                        {m.homeScore ?? '-'} - {m.awayScore ?? '-'}
                      </span>
                      <span className="text-sm font-semibold truncate">{m.awayTeam?.shortName || m.awayTeam?.name}</span>
                      {m.awayTeam?.crest && <img src={m.awayTeam.crest} alt="" className="w-5 h-5 object-contain" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {m.competition && <CompetitionBadge name={m.competition.name} code={m.competition.code} size="sm" />}
                      <span className="text-xs text-[var(--text-muted)]">{date}</span>
                    </div>
                  </div>

                  {/* Market results — always visible, compact on mobile */}
                  <div className="flex items-center gap-1">
                    <MarketResult label="1X2" correct={item.result1x2Correct} />
                    <MarketResult label="O2.5" correct={item.resultOver25Correct} />
                    <MarketResult label="BTTS" correct={item.resultBttsCorrect} />
                  </div>

                  {/* Predicted winner */}
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    item.predictedWinner === 'HOME_TEAM' ? 'bg-[var(--emerald)]/20 text-[var(--emerald)]' :
                    item.predictedWinner === 'DRAW' ? 'bg-[var(--gold)]/20 text-[var(--gold)]' :
                    'bg-[var(--red)]/20 text-[var(--red)]'
                  }`}>
                    {item.predictedWinner === 'HOME_TEAM' ? '1' : item.predictedWinner === 'DRAW' ? 'X' : '2'}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm disabled:opacity-30 hover:bg-[var(--card-hover)] transition-colors flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" /> Precedente
            </button>
            <span className="text-sm text-[var(--text-muted)]">Pagina {page}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!hasMore}
              className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm disabled:opacity-30 hover:bg-[var(--card-hover)] transition-colors flex items-center gap-1">
              Successiva <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        <div className="glass-card p-12 text-center">
          <Clock className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <h3 className="text-lg font-bold mb-2">Nessun pronostico verificato</h3>
          <p className="text-[var(--text-secondary)] text-sm">
            Lo storico si aggiornera automaticamente al termine delle partite.
          </p>
        </div>
      )}
    </div>
  );
}
