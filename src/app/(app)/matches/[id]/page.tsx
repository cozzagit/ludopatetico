'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, MapPin, Loader2, Zap, Shield, AlertTriangle,
  Activity, UserX, Clock, Blocks, Brain
} from 'lucide-react';
import { PredictionPanel } from '@/src/components/match/prediction-panel';
import { PremiumGate } from '@/src/components/premium/premium-gate';
import { CompetitionBadge } from '@/src/components/shared/competition-badge';
import { FormBadgeExtended } from '@/src/components/shared/form-badge';
import { ThreeWayBar } from '@/src/components/shared/probability-bar';

interface MatchDetail {
  id: number;
  utcDate: string;
  status: string;
  matchday?: number | null;
  stage?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  homeScoreHT?: number | null;
  awayScoreHT?: number | null;
  winner?: string | null;
  homeTeam?: { id: number; name: string; shortName?: string | null; tla?: string | null; crest?: string | null } | null;
  awayTeam?: { id: number; name: string; shortName?: string | null; tla?: string | null; crest?: string | null } | null;
  competition?: { id: number; name: string; code: string; emblem?: string | null } | null;
  prediction?: any;
  homeForm?: { recentForm: string } | null;
  awayForm?: { recentForm: string } | null;
  homeInjuries?: Array<{ playerName: string; type: string; reason: string }>;
  awayInjuries?: Array<{ playerName: string; type: string; reason: string }>;
  marketOdds?: {
    provider: string;
    homeWinProb?: string | null;
    drawProb?: string | null;
    awayWinProb?: string | null;
    over25Prob?: string | null;
    over35Prob?: string | null;
    bttsYesProb?: string | null;
    totalVolume?: string | null;
    totalLiquidity?: string | null;
    lastUpdated?: string | null;
  } | null;
}

function formatMatchDate(dateStr: string) {
  const d = new Date(dateStr);
  return {
    full: d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    time: d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
  };
}

function NoPredictionBlock({ matchId, isAdmin, isPremium, onGenerated }: {
  matchId: number; isAdmin?: boolean; isPremium?: boolean; onGenerated: (data: any) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const canGenerate = isAdmin || isPremium;

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch(`/api/predictions/generate/${matchId}`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error?.message || 'Errore nella generazione');
        return;
      }
      const data = await res.json();
      onGenerated(data);
    } catch {
      setError('Errore di connessione');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="glass-card p-10 text-center">
      <Zap className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
      <h3 className="text-lg font-bold mb-2">Pronostico non disponibile</h3>
      <p className="text-[var(--text-secondary)] text-sm mb-4">
        Il pronostico per questa partita non e ancora stato generato.
      </p>
      {canGenerate && (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-violet text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generazione in corso...</>
          ) : (
            <><Brain className="w-4 h-4" /> Genera Pronostico AI</>
          )}
        </button>
      )}
      {error && (
        <p className="text-[var(--red)] text-sm mt-3">{error}</p>
      )}
    </div>
  );
}

function InjuryRow({ injury }: { injury: { playerName: string; type: string; reason: string } }) {
  const typeColor = injury.type === 'suspension' ? 'text-[var(--red)]' : injury.type === 'doubtful' ? 'text-[var(--gold)]' : 'text-[var(--red)]';
  const typeLabel = injury.type === 'suspension' ? 'Squalificato' : injury.type === 'doubtful' ? 'In dubbio' : 'Infortunato';
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm">{injury.playerName}</span>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[var(--text-muted)]">{injury.reason}</span>
        <span className={`font-medium ${typeColor}`}>{typeLabel}</span>
      </div>
    </div>
  );
}

export default function MatchDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const user = session?.user as any;
  const isPremium = user?.isPremium || false;

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/matches/${params.id}`);
        if (!res.ok) {
          setError('Partita non trovata');
          return;
        }
        const data = await res.json();
        setMatch(data.data);
      } catch {
        setError('Errore nel caricamento della partita');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--violet)]" />
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="glass-card p-12 text-center max-w-lg mx-auto mt-12">
        <AlertTriangle className="w-12 h-12 text-[var(--gold)] mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">{error || 'Partita non trovata'}</h2>
        <Link href="/matches" className="text-[var(--violet)] hover:underline text-sm mt-4 inline-block">
          Torna alle partite
        </Link>
      </div>
    );
  }

  const { full: dateStr, time } = formatMatchDate(match.utcDate);
  const isFinished = match.status === 'FINISHED';
  const isLive = match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const pred = match.prediction;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <Link href="/matches" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Torna alle partite
      </Link>

      {/* Match Header Card */}
      <div className="glass-card overflow-hidden">
        {/* Competition & Status bar */}
        <div className="px-6 py-3 border-b border-[var(--border)]/50 flex items-center justify-between bg-[var(--card-hover)]/30">
          {match.competition && (
            <CompetitionBadge name={match.competition.name} code={match.competition.code} emblem={match.competition.emblem} />
          )}
          <div className="flex items-center gap-3">
            {match.matchday && (
              <span className="text-xs text-[var(--text-muted)]">Giornata {match.matchday}</span>
            )}
            {isLive && (
              <span className="px-2 py-0.5 rounded bg-[var(--red)]/20 text-[var(--red)] text-xs font-bold animate-pulse flex items-center gap-1">
                <Activity className="w-3 h-3" /> LIVE
              </span>
            )}
            {isFinished && (
              <span className="px-2 py-0.5 rounded bg-[var(--emerald)]/10 text-[var(--emerald)] text-xs font-medium">
                Terminata
              </span>
            )}
          </div>
        </div>

        {/* Teams & Score */}
        <div className="px-6 py-8">
          <div className="flex items-center justify-center gap-6 sm:gap-10">
            {/* Home Team */}
            <div className="flex-1 text-center">
              {match.homeTeam?.crest && (
                <img src={match.homeTeam.crest} alt="" className="w-16 h-16 sm:w-20 sm:h-20 object-contain mx-auto mb-3" />
              )}
              <div className="font-bold text-lg sm:text-xl">{match.homeTeam?.shortName || match.homeTeam?.name || 'TBD'}</div>
              {match.homeTeam?.tla && (
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{match.homeTeam.tla}</div>
              )}
              {match.homeForm?.recentForm && (
                <div className="mt-2 flex justify-center">
                  <FormBadgeExtended form={match.homeForm.recentForm} />
                </div>
              )}
            </div>

            {/* Score / VS */}
            <div className="text-center shrink-0">
              {isFinished || isLive ? (
                <>
                  <div className={`text-4xl sm:text-5xl font-extrabold tabular-nums ${isLive ? 'text-[var(--red)]' : ''}`}>
                    {match.homeScore ?? 0} - {match.awayScore ?? 0}
                  </div>
                  {(match.homeScoreHT !== null && match.homeScoreHT !== undefined) && (
                    <div className="text-sm text-[var(--text-muted)] mt-1">
                      PT: {match.homeScoreHT} - {match.awayScoreHT}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-1">
                  <div className="text-3xl font-bold text-[var(--text-muted)]">VS</div>
                </div>
              )}
            </div>

            {/* Away Team */}
            <div className="flex-1 text-center">
              {match.awayTeam?.crest && (
                <img src={match.awayTeam.crest} alt="" className="w-16 h-16 sm:w-20 sm:h-20 object-contain mx-auto mb-3" />
              )}
              <div className="font-bold text-lg sm:text-xl">{match.awayTeam?.shortName || match.awayTeam?.name || 'TBD'}</div>
              {match.awayTeam?.tla && (
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{match.awayTeam.tla}</div>
              )}
              {match.awayForm?.recentForm && (
                <div className="mt-2 flex justify-center">
                  <FormBadgeExtended form={match.awayForm.recentForm} />
                </div>
              )}
            </div>
          </div>

          {/* Date & time */}
          <div className="flex items-center justify-center gap-4 mt-6 text-sm text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" /> {dateStr}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> {time}
            </span>
          </div>
        </div>

        {/* Quick 1X2 bar if prediction exists */}
        {pred && (
          <div className="px-6 pb-6">
            <ThreeWayBar
              homeValue={parseFloat(pred.homeWinProbability)}
              drawValue={parseFloat(pred.drawProbability)}
              awayValue={parseFloat(pred.awayWinProbability)}
              homeLabel={match.homeTeam?.tla || '1'}
              drawLabel="X"
              awayLabel={match.awayTeam?.tla || '2'}
            />
          </div>
        )}
      </div>

      {/* Prediction section */}
      {pred ? (
        <>
          {/* Free section: basic 1X2 + Over 2.5 */}
          <div className="space-y-6">
            {/* AI Badge */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-violet flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-bold">Pronostico AI</div>
                <div className="text-xs text-[var(--text-muted)]">
                  Generato il {new Date(pred.createdAt).toLocaleDateString('it-IT')}
                </div>
              </div>
              {pred.isPremium && (
                <span className="ml-auto px-2.5 py-0.5 rounded-full gradient-gold text-black text-xs font-bold">
                  PREMIUM
                </span>
              )}
            </div>

            {/* Premium gated content */}
            {pred.isPremium ? (
              <PremiumGate isPremium={isPremium} label="Analisi Completa Premium">
                <PredictionPanel
                  prediction={pred}
                  homeTeamName={match.homeTeam?.shortName || match.homeTeam?.name || 'Casa'}
                  awayTeamName={match.awayTeam?.shortName || match.awayTeam?.name || 'Trasferta'}
                />
              </PremiumGate>
            ) : (
              <PredictionPanel
                prediction={pred}
                homeTeamName={match.homeTeam?.shortName || match.homeTeam?.name || 'Casa'}
                awayTeamName={match.awayTeam?.shortName || match.awayTeam?.name || 'Trasferta'}
              />
            )}
          </div>
        </>
      ) : (
        <NoPredictionBlock matchId={match.id} isAdmin={user?.isAdmin} isPremium={isPremium} onGenerated={(data) => setMatch(prev => prev ? { ...prev, prediction: data } : prev)} />
      )}

      {/* Blockchain Market Odds */}
      {match.marketOdds && match.marketOdds.homeWinProb && (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2">
              <Blocks className="w-4 h-4 text-[var(--emerald)]" />
              Mercati Predittivi Blockchain
            </h3>
            <span className="text-xs text-[var(--text-muted)] px-2 py-0.5 rounded bg-[var(--emerald)]/10 text-[var(--emerald)]">
              Polymarket
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-4">
            Probabilita derivate da mercati dove persone reali scommettono soldi veri su blockchain.
          </p>

          {/* 1X2 from market */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-3 rounded-lg bg-[var(--card-hover)]/50">
              <div className="text-xs text-[var(--text-muted)] mb-1">{match.homeTeam?.shortName || '1'}</div>
              <div className="text-lg font-bold text-[var(--emerald)]">
                {(parseFloat(match.marketOdds.homeWinProb!) * 100).toFixed(1)}%
              </div>
            </div>
            {match.marketOdds.drawProb && (
              <div className="text-center p-3 rounded-lg bg-[var(--card-hover)]/50">
                <div className="text-xs text-[var(--text-muted)] mb-1">Pareggio</div>
                <div className="text-lg font-bold text-[var(--gold)]">
                  {(parseFloat(match.marketOdds.drawProb) * 100).toFixed(1)}%
                </div>
              </div>
            )}
            {match.marketOdds.awayWinProb && (
              <div className="text-center p-3 rounded-lg bg-[var(--card-hover)]/50">
                <div className="text-xs text-[var(--text-muted)] mb-1">{match.awayTeam?.shortName || '2'}</div>
                <div className="text-lg font-bold text-[var(--red)]">
                  {(parseFloat(match.marketOdds.awayWinProb) * 100).toFixed(1)}%
                </div>
              </div>
            )}
          </div>

          {/* Additional market data */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {match.marketOdds.over25Prob && (
              <div className="text-center p-2 rounded bg-[var(--card-hover)]/30">
                <div className="text-xs text-[var(--text-muted)]">Over 2.5</div>
                <div className="text-sm font-bold">{(parseFloat(match.marketOdds.over25Prob) * 100).toFixed(1)}%</div>
              </div>
            )}
            {match.marketOdds.over35Prob && (
              <div className="text-center p-2 rounded bg-[var(--card-hover)]/30">
                <div className="text-xs text-[var(--text-muted)]">Over 3.5</div>
                <div className="text-sm font-bold">{(parseFloat(match.marketOdds.over35Prob) * 100).toFixed(1)}%</div>
              </div>
            )}
            {match.marketOdds.bttsYesProb && (
              <div className="text-center p-2 rounded bg-[var(--card-hover)]/30">
                <div className="text-xs text-[var(--text-muted)]">GG (Goal)</div>
                <div className="text-sm font-bold">{(parseFloat(match.marketOdds.bttsYesProb) * 100).toFixed(1)}%</div>
              </div>
            )}
          </div>

          {/* Volume indicator */}
          {match.marketOdds.totalVolume && (
            <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Volume: ${parseFloat(match.marketOdds.totalVolume).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              {match.marketOdds.lastUpdated && (
                <span>Aggiornato: {new Date(match.marketOdds.lastUpdated).toLocaleString('it-IT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Injuries section */}
      {((match.homeInjuries && match.homeInjuries.length > 0) || (match.awayInjuries && match.awayInjuries.length > 0)) && (
        <div className="glass-card p-5">
          <h3 className="font-bold flex items-center gap-2 mb-4">
            <UserX className="w-4 h-4 text-[var(--red)]" />
            Assenze
          </h3>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Home injuries */}
            {match.homeInjuries && match.homeInjuries.length > 0 && (
              <div>
                <div className="text-sm font-semibold text-[var(--text-muted)] mb-2 flex items-center gap-2">
                  {match.homeTeam?.crest && <img src={match.homeTeam.crest} alt="" className="w-4 h-4" />}
                  {match.homeTeam?.shortName || match.homeTeam?.name}
                </div>
                <div className="divide-y divide-[var(--border)]/30">
                  {match.homeInjuries.map((inj, i) => (
                    <InjuryRow key={i} injury={inj} />
                  ))}
                </div>
              </div>
            )}

            {/* Away injuries */}
            {match.awayInjuries && match.awayInjuries.length > 0 && (
              <div>
                <div className="text-sm font-semibold text-[var(--text-muted)] mb-2 flex items-center gap-2">
                  {match.awayTeam?.crest && <img src={match.awayTeam.crest} alt="" className="w-4 h-4" />}
                  {match.awayTeam?.shortName || match.awayTeam?.name}
                </div>
                <div className="divide-y divide-[var(--border)]/30">
                  {match.awayInjuries.map((inj, i) => (
                    <InjuryRow key={i} injury={inj} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
