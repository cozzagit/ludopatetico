'use client';

import { useEffect, useState } from 'react';
import {
  Loader2, Star, TrendingUp, Shield, Zap, ChevronDown, ChevronUp,
  Calendar, Trophy, Target, BarChart3, Blocks
} from 'lucide-react';
import Link from 'next/link';

interface SuggestedBet {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamCrest: string | null;
  awayTeamCrest: string | null;
  competition: string;
  competitionCode: string;
  utcDate: string;
  betType: string;
  betLabel: string;
  betValue: string;
  probability: number;
  historicalAccuracy: number;
  marketOddsProb: number | null;
  reliabilityScore: number;
  confidence: number;
  reasoning: string;
}

interface Schedina {
  date: string;
  bets: SuggestedBet[];
  combinedReliability: number;
}

function reliabilityColor(score: number) {
  if (score >= 60) return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', ring: 'ring-emerald-500/30', label: 'Alta' };
  if (score >= 50) return { bg: 'bg-emerald-500/10', text: 'text-emerald-300', ring: 'ring-emerald-500/20', label: 'Buona' };
  if (score >= 40) return { bg: 'bg-yellow-500/10', text: 'text-yellow-300', ring: 'ring-yellow-500/20', label: 'Media' };
  return { bg: 'bg-orange-500/10', text: 'text-orange-300', ring: 'ring-orange-500/20', label: 'Bassa' };
}

function betTypeIcon(betType: string) {
  if (betType.startsWith('1X2') || betType.startsWith('DC')) return Target;
  if (betType.includes('OVER') || betType.includes('UNDER')) return TrendingUp;
  if (betType.includes('BTTS')) return Zap;
  return Star;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function BetCard({ bet, rank }: { bet: SuggestedBet; rank: number }) {
  const rel = reliabilityColor(bet.reliabilityScore);
  const Icon = betTypeIcon(bet.betType);

  return (
    <Link href={`/matches/${bet.matchId}`} className="block">
      <div className={`glass-card p-4 hover:bg-[var(--card-hover)] transition-all group ${rank <= 3 ? 'ring-1 ' + rel.ring : ''}`}>
        <div className="flex items-start gap-3">
          {/* Rank */}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-extrabold shrink-0 ${
            rank === 1 ? 'gradient-gold text-black' :
            rank === 2 ? 'bg-gray-300/20 text-gray-300' :
            rank === 3 ? 'bg-orange-500/20 text-orange-400' :
            'bg-[var(--card-hover)] text-[var(--text-muted)]'
          }`}>
            {rank}
          </div>

          <div className="flex-1 min-w-0">
            {/* Match info */}
            <div className="flex items-center gap-2 mb-1.5">
              {bet.homeTeamCrest && <img src={bet.homeTeamCrest} alt="" className="w-4 h-4 object-contain" />}
              <span className="text-sm font-semibold truncate">{bet.homeTeam}</span>
              <span className="text-xs text-[var(--text-muted)]">vs</span>
              <span className="text-sm font-semibold truncate">{bet.awayTeam}</span>
              {bet.awayTeamCrest && <img src={bet.awayTeamCrest} alt="" className="w-4 h-4 object-contain" />}
            </div>

            {/* Competition & time */}
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-2">
              <span>{bet.competition}</span>
              <span>-</span>
              <span>{formatTime(bet.utcDate)}</span>
            </div>

            {/* Bet suggestion */}
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4 text-[var(--violet)]" />
              <span className={`px-2.5 py-1 rounded-lg text-sm font-bold ${rel.bg} ${rel.text}`}>
                {bet.betLabel}
              </span>
              <span className="text-sm font-medium">{bet.betValue}</span>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <Target className="w-3 h-3 text-[var(--violet)]" />
                <span className="text-[var(--text-muted)]">AI:</span>
                <span className="font-bold">{bet.probability.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1">
                <BarChart3 className="w-3 h-3 text-[var(--blue)]" />
                <span className="text-[var(--text-muted)]">Storico:</span>
                <span className="font-bold">{bet.historicalAccuracy.toFixed(0)}%</span>
              </div>
              {bet.marketOddsProb && (
                <div className="flex items-center gap-1">
                  <Blocks className="w-3 h-3 text-[var(--emerald)]" />
                  <span className="text-[var(--text-muted)]">Mercato:</span>
                  <span className="font-bold">{bet.marketOddsProb.toFixed(0)}%</span>
                </div>
              )}
            </div>

            {/* Reasoning */}
            <p className="text-xs text-[var(--text-muted)] mt-1.5 italic">{bet.reasoning}</p>
          </div>

          {/* Reliability score */}
          <div className={`text-center shrink-0 px-3 py-2 rounded-xl ${rel.bg} ring-1 ${rel.ring}`}>
            <div className={`text-lg font-extrabold tabular-nums ${rel.text}`}>
              {bet.reliabilityScore.toFixed(0)}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">{rel.label}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function SchedinaCard({ schedina, index }: { schedina: Schedina; index: number }) {
  const [expanded, setExpanded] = useState(index === 0);
  const rel = reliabilityColor(schedina.combinedReliability);
  const dateLabel = formatDate(schedina.date);

  return (
    <div className={`glass-card overflow-hidden ${index === 0 ? 'ring-1 ring-[var(--gold)]/30' : ''}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-5 flex items-center justify-between hover:bg-[var(--card-hover)]/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            index === 0 ? 'gradient-gold' : 'bg-[var(--violet)]/20'
          }`}>
            <Trophy className={`w-5 h-5 ${index === 0 ? 'text-black' : 'text-[var(--violet)]'}`} />
          </div>
          <div className="text-left">
            <div className="font-bold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--text-muted)]" />
              {dateLabel}
              {index === 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[var(--gold)]/20 text-[var(--gold)] text-[10px] font-bold uppercase">
                  Consigliata
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">
              {schedina.bets.length} selezioni - {schedina.bets.map(b => b.competitionCode).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-lg ${rel.bg} ${rel.text} text-sm font-bold`}>
            {schedina.combinedReliability.toFixed(0)} pts
          </div>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Bets list */}
      {expanded && (
        <div className="border-t border-[var(--border)]/30 p-4 space-y-3">
          {schedina.bets.map((bet, i) => {
            const BIcon = betTypeIcon(bet.betType);
            const brel = reliabilityColor(bet.reliabilityScore);
            return (
              <Link key={`${bet.matchId}-${bet.betType}`} href={`/matches/${bet.matchId}`} className="block">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--card-hover)]/30 hover:bg-[var(--card-hover)] transition-colors">
                  <div className="text-xs font-bold text-[var(--text-muted)] w-5">{i + 1}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {bet.homeTeamCrest && <img src={bet.homeTeamCrest} alt="" className="w-4 h-4 object-contain" />}
                      <span className="text-sm font-medium truncate">{bet.homeTeam} - {bet.awayTeam}</span>
                      {bet.awayTeamCrest && <img src={bet.awayTeamCrest} alt="" className="w-4 h-4 object-contain" />}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {bet.competition} - {formatTime(bet.utcDate)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <BIcon className="w-3.5 h-3.5 text-[var(--violet)]" />
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${brel.bg} ${brel.text}`}>
                      {bet.betLabel}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold tabular-nums">{bet.probability.toFixed(0)}%</div>
                    <div className="text-[10px] text-[var(--text-muted)]">Score: {bet.reliabilityScore.toFixed(0)}</div>
                  </div>
                </div>
              </Link>
            );
          })}

          {/* Schedina summary */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]/20 text-xs">
            <span className="text-[var(--text-muted)]">
              Affidabilita media: <span className={`font-bold ${rel.text}`}>{schedina.combinedReliability.toFixed(1)}</span>
            </span>
            <span className="text-[var(--text-muted)]">
              {schedina.bets.length} eventi - {schedina.bets.filter(b => b.marketOddsProb).length} con dati Polymarket
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SchedinePage() {
  const [topBets, setTopBets] = useState<SuggestedBet[]>([]);
  const [schedine, setSchedine] = useState<Schedina[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'schedine' | 'ranking'>('schedine');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/predictions/suggested-bets');
        if (res.ok) {
          const data = await res.json();
          setTopBets(data.topBets || []);
          setSchedine(data.schedine || []);
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <Star className="w-6 h-6 text-[var(--gold)]" />
          Schedine AI
        </h1>
        <p className="text-[var(--text-secondary)] mt-1">
          Suggerimenti basati su AI + dati storici + mercati blockchain Polymarket
        </p>
      </div>

      {/* Legend */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-[var(--violet)]" />
          <span className="text-sm font-bold">Come funziona il punteggio</span>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Ogni scommessa ha un punteggio di affidabilita (0-100) calcolato su: 40% probabilita AI, 30% accuratezza storica del mercato in quella competizione, 20% conferma Polymarket, 10% confidenza generale. Piu alto = piu affidabile.
        </p>
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('schedine')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            view === 'schedine'
              ? 'bg-[var(--violet)] text-white shadow-lg shadow-violet/25'
              : 'bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--card-hover)] border border-[var(--border)]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Trophy className="w-4 h-4" />
            Schedine del giorno
          </div>
        </button>
        <button
          onClick={() => setView('ranking')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            view === 'ranking'
              ? 'bg-[var(--violet)] text-white shadow-lg shadow-violet/25'
              : 'bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--card-hover)] border border-[var(--border)]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" />
            Ranking scommesse
          </div>
        </button>
      </div>

      {/* Schedine view */}
      {view === 'schedine' && (
        <div className="space-y-4">
          {schedine.length > 0 ? (
            schedine.map((s, i) => (
              <SchedinaCard key={s.date} schedina={s} index={i} />
            ))
          ) : (
            <div className="glass-card p-12 text-center">
              <Trophy className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">Nessuna schedina disponibile</h3>
              <p className="text-[var(--text-secondary)] text-sm">
                Servono almeno 2 partite nello stesso giorno con pronostici per generare schedine.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Ranking view */}
      {view === 'ranking' && (
        <div className="space-y-3">
          {topBets.length > 0 ? (
            topBets.map((bet, i) => (
              <BetCard key={`${bet.matchId}-${bet.betType}`} bet={bet} rank={i + 1} />
            ))
          ) : (
            <div className="glass-card p-12 text-center">
              <Star className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">Nessun suggerimento</h3>
              <p className="text-[var(--text-secondary)] text-sm">
                I suggerimenti appariranno quando ci saranno pronostici per le prossime partite.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
