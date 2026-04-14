'use client';

import { useEffect, useState } from 'react';
import {
  Loader2, Star, TrendingUp, Shield, Zap, ChevronDown, ChevronUp,
  Calendar, Trophy, Target, BarChart3, Blocks, Equal, Copy, Diamond
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
  type: 'safe' | 'moderate' | 'bold';
  label: string;
  emoji: string;
  description: string;
  bets: SuggestedBet[];
  combinedReliability: number;
  combinedProbability: number;
}

interface XBet {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  matchDate: string;
  bet: string;
  drawScore: number;
  drawProbability: number;
  over25Probability: number;
  signals: string[];
}

interface SchedinaX {
  tier: string;
  label: string;
  description: string;
  bets: XBet[];
  combinedDrawProb: number;
}

interface SchedinaXResponse {
  schedineX: SchedinaX[];
  stats: { totalMatchesAnalyzed: number; matchesWithDrawSignal: number; averageDrawScore: number };
}

interface MultidayBet {
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
  reliabilityScore: number;
  reasoning: string;
}

interface MultidaySchedina {
  id: string;
  label: string;
  emoji: string;
  theme: string;
  description: string;
  dateRange: string;
  competitionCodes: string[];
  bets: MultidayBet[];
  combinedProbability: number;
  combinedReliability: number;
  betCount: number;
}

interface ValueBet {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamCrest: string | null;
  awayTeamCrest: string | null;
  competition: string;
  competitionCode: string;
  utcDate: string;
  marketType: string;
  marketLabel: string;
  aiProbability: number;
  polymarketProbability: number;
  edge: number;
  absEdge: number;
  direction: 'VALUE' | 'CAUTION';
  signalStrength: 'low' | 'medium' | 'high';
}

const X_TIER_STYLES: Record<string, { gradient: string; border: string; badge: string; accent: string }> = {
  X_SICURA: {
    gradient: 'from-amber-600/20 to-yellow-900/10',
    border: 'ring-amber-500/30',
    badge: 'bg-amber-500/20 text-amber-400',
    accent: 'var(--gold)',
  },
  X_BILANCIATA: {
    gradient: 'from-purple-600/20 to-purple-900/10',
    border: 'ring-purple-500/30',
    badge: 'bg-purple-500/20 text-purple-400',
    accent: 'var(--violet)',
  },
  X_RISCHIOSA: {
    gradient: 'from-red-600/20 to-red-900/10',
    border: 'ring-red-500/30',
    badge: 'bg-red-500/20 text-red-400',
    accent: 'var(--red, #ef4444)',
  },
};

function buildSchedinaXText(schedina: SchedinaX): string {
  const lines = [`🎯 ${schedina.label.toUpperCase()}`];
  schedina.bets.forEach((bet, i) => {
    lines.push(`${i + 1}. ${bet.homeTeam} vs ${bet.awayTeam} → X (Score ${bet.drawScore})`);
  });
  lines.push(`Prob. X combinata: ${schedina.combinedDrawProb.toFixed(1)}%`);
  return lines.join('\n');
}

function SchedinaXCard({ schedina, isFirst }: { schedina: SchedinaX; isFirst: boolean }) {
  const [expanded, setExpanded] = useState(isFirst);
  const [copied, setCopied] = useState(false);
  const style = X_TIER_STYLES[schedina.tier] || X_TIER_STYLES.X_SICURA;

  function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    const text = buildSchedinaXText(schedina);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className={`glass-card overflow-hidden ring-1 ${style.border}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full p-5 bg-gradient-to-r ${style.gradient} hover:brightness-110 transition-all`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-black/20 backdrop-blur">
              <span className="text-2xl">🎯</span>
            </div>
            <div className="text-left">
              <div className="font-extrabold text-lg flex items-center gap-2">
                {schedina.label}
                {isFirst && (
                  <span className="px-2 py-0.5 rounded-full bg-[var(--gold)]/20 text-[var(--gold)] text-[10px] font-bold uppercase animate-pulse">
                    BEST X
                  </span>
                )}
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-0.5">{schedina.description}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs text-[var(--text-muted)]">Prob. combinata X</div>
              <div className="text-sm font-bold tabular-nums" style={{ color: style.accent }}>
                {schedina.combinedDrawProb.toFixed(1)}%
              </div>
            </div>
            <div className={`px-3 py-2 rounded-xl ${style.badge} text-center min-w-[60px]`}>
              <div className="text-lg font-extrabold tabular-nums">{schedina.bets.length}</div>
              <div className="text-[9px] uppercase tracking-wider opacity-70">pareggi</div>
            </div>
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-[var(--border)]/20">
          {schedina.bets.map((bet, i) => (
            <div key={`${bet.matchId}-x`} className="p-4 hover:bg-[var(--card-hover)]/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${style.badge}`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">{bet.homeTeam}</span>
                    <span className="text-xs text-[var(--text-muted)]">vs</span>
                    <span className="text-sm font-semibold">{bet.awayTeam}</span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5">
                    <span>{bet.competition}</span>
                    <span>-</span>
                    <span>{formatTime(bet.matchDate)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {bet.signals.map((sig, si) => (
                      <span key={si} className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-300">
                        {sig}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 ring-1 ring-amber-500/30`}>
                    <Equal className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-sm font-extrabold text-amber-400">X</span>
                  </div>
                  <div className="text-sm font-bold tabular-nums mt-1" style={{ color: style.accent }}>
                    Score {bet.drawScore}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div className="p-4 flex items-center justify-between text-xs bg-[var(--card-hover)]/20">
            <span className="text-[var(--text-muted)]">
              Prob. X combinata: <span className="font-bold" style={{ color: style.accent }}>{schedina.combinedDrawProb.toFixed(1)}%</span>
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--card-hover)] transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Copy className="w-3 h-3" />
              <span>{copied ? 'Copiato!' : 'Copia'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
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

const TYPE_STYLES = {
  safe: {
    gradient: 'from-emerald-600/20 to-emerald-900/10',
    border: 'ring-emerald-500/30',
    badge: 'bg-emerald-500/20 text-emerald-400',
    icon: Shield,
    accent: 'var(--emerald)',
  },
  moderate: {
    gradient: 'from-blue-600/20 to-blue-900/10',
    border: 'ring-blue-500/30',
    badge: 'bg-blue-500/20 text-blue-400',
    icon: Target,
    accent: 'var(--blue)',
  },
  bold: {
    gradient: 'from-orange-600/20 to-red-900/10',
    border: 'ring-orange-500/30',
    badge: 'bg-orange-500/20 text-orange-400',
    icon: Zap,
    accent: 'var(--gold)',
  },
};

function buildSchedineText(schedina: Schedina): string {
  const dateLabel = formatDate(schedina.date);
  const lines = [`${schedina.emoji} ${schedina.label.toUpperCase()} - ${dateLabel}`];
  schedina.bets.forEach((bet, i) => {
    lines.push(`${i + 1}. ${bet.homeTeam} vs ${bet.awayTeam} → ${bet.betLabel} ${bet.betValue} (${bet.probability.toFixed(0)}%)`);
  });
  lines.push(`Prob. combinata: ${schedina.combinedProbability.toFixed(1)}%`);
  return lines.join('\n');
}

function SchedinaCard({ schedina, isFirst }: { schedina: Schedina; isFirst: boolean }) {
  const [expanded, setExpanded] = useState(isFirst);
  const [copied, setCopied] = useState(false);
  const style = TYPE_STYLES[schedina.type];
  const TypeIcon = style.icon;
  const dateLabel = formatDate(schedina.date);

  function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    const text = buildSchedineText(schedina);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className={`glass-card overflow-hidden ring-1 ${style.border}`}>
      {/* Gradient header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full p-5 bg-gradient-to-r ${style.gradient} hover:brightness-110 transition-all`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-black/20 backdrop-blur">
              <span className="text-2xl">{schedina.emoji}</span>
            </div>
            <div className="text-left">
              <div className="font-extrabold text-lg flex items-center gap-2">
                {schedina.label}
                {isFirst && (
                  <span className="px-2 py-0.5 rounded-full bg-[var(--gold)]/20 text-[var(--gold)] text-[10px] font-bold uppercase animate-pulse">
                    TOP PICK
                  </span>
                )}
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-0.5 flex items-center gap-2">
                <Calendar className="w-3 h-3" />
                {dateLabel}
                <span className="opacity-50">|</span>
                {schedina.bets.map(b => b.competitionCode).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Combined probability */}
            <div className="text-right hidden sm:block">
              <div className="text-xs text-[var(--text-muted)]">Prob. combinata</div>
              <div className="text-sm font-bold tabular-nums" style={{ color: style.accent }}>
                {schedina.combinedProbability.toFixed(1)}%
              </div>
            </div>

            <div className={`px-3 py-2 rounded-xl ${style.badge} text-center min-w-[60px]`}>
              <div className="text-lg font-extrabold tabular-nums">{schedina.bets.length}</div>
              <div className="text-[9px] uppercase tracking-wider opacity-70">eventi</div>
            </div>
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-2 text-left">{schedina.description}</p>
      </button>

      {/* Bets list */}
      {expanded && (
        <div className="divide-y divide-[var(--border)]/20">
          {schedina.bets.map((bet, i) => {
            const BIcon = betTypeIcon(bet.betType);
            const brel = reliabilityColor(bet.reliabilityScore);
            return (
              <Link key={`${bet.matchId}-${bet.betType}`} href={`/matches/${bet.matchId}`} className="block">
                <div className="flex items-center gap-3 p-4 hover:bg-[var(--card-hover)]/50 transition-colors">
                  {/* Number */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${style.badge}`}>
                    {i + 1}
                  </div>

                  {/* Match */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {bet.homeTeamCrest && <img src={bet.homeTeamCrest} alt="" className="w-5 h-5 object-contain" />}
                      <span className="text-sm font-semibold">{bet.homeTeam}</span>
                      <span className="text-xs text-[var(--text-muted)]">vs</span>
                      <span className="text-sm font-semibold">{bet.awayTeam}</span>
                      {bet.awayTeamCrest && <img src={bet.awayTeamCrest} alt="" className="w-5 h-5 object-contain" />}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5">
                      <span>{bet.competition}</span>
                      <span>-</span>
                      <span>{formatTime(bet.utcDate)}</span>
                      {bet.marketOddsProb && (
                        <>
                          <span className="opacity-40">|</span>
                          <Blocks className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">{bet.marketOddsProb.toFixed(0)}%</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Bet type */}
                  <div className="text-right shrink-0">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${brel.bg} ring-1 ${brel.ring}`}>
                      <BIcon className="w-3.5 h-3.5" />
                      <span className={`text-xs font-bold ${brel.text}`}>{bet.betLabel}</span>
                    </div>
                    <div className="text-lg font-extrabold tabular-nums mt-1" style={{ color: style.accent }}>
                      {bet.probability.toFixed(0)}%
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}

          {/* Footer */}
          <div className="p-4 flex items-center justify-between text-xs bg-[var(--card-hover)]/20">
            <div className="flex items-center gap-4">
              <span className="text-[var(--text-muted)]">
                Affidabilita: <span className="font-bold" style={{ color: style.accent }}>{schedina.combinedReliability.toFixed(0)}/100</span>
              </span>
              <span className="text-[var(--text-muted)]">
                Prob. combinata: <span className="font-bold">{schedina.combinedProbability.toFixed(1)}%</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[var(--text-muted)]">
                {schedina.bets.filter(b => b.marketOddsProb).length}/{schedina.bets.length} confermati da Polymarket
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--card-hover)] transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <Copy className="w-3 h-3" />
                <span>{copied ? 'Copiato!' : 'Copia'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const MARKET_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  '1X2_HOME': { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  '1X2_AWAY': { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  'OVER_25': { bg: 'bg-cyan-500/15', text: 'text-cyan-400' },
  'BTTS_YES': { bg: 'bg-amber-500/15', text: 'text-amber-400' },
};

function ValueBetCard({ bet }: { bet: ValueBet }) {
  const isValue = bet.direction === 'VALUE';
  const edgeColor = isValue ? 'text-emerald-400' : 'text-red-400';
  const edgeBg = isValue ? 'bg-emerald-500/10 ring-emerald-500/30' : 'bg-red-500/10 ring-red-500/30';
  const mktColor = MARKET_TYPE_COLORS[bet.marketType] || { bg: 'bg-gray-500/15', text: 'text-gray-400' };
  const signalLabel = bet.signalStrength === 'high' ? 'Forte' : bet.signalStrength === 'medium' ? 'Medio' : 'Debole';
  const signalDots = bet.signalStrength === 'high' ? '●●●' : bet.signalStrength === 'medium' ? '●●○' : '●○○';
  const signalColor = bet.signalStrength === 'high' ? 'text-emerald-400' : bet.signalStrength === 'medium' ? 'text-emerald-400' : 'text-yellow-400';

  return (
    <Link href={`/matches/${bet.matchId}`} className="block">
      <div className="glass-card p-4 hover:bg-[var(--card-hover)] transition-all">
        <div className="flex items-start gap-3">
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
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-2.5">
              <span>{bet.competition}</span>
              <span>-</span>
              <span>{formatTime(bet.utcDate)}</span>
            </div>

            {/* Market type badge */}
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${mktColor.bg} ${mktColor.text}`}>
                {bet.marketLabel}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isValue ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                {isValue ? 'VALUE' : 'CAUTION'}
              </span>
            </div>

            {/* AI vs Polymarket bars */}
            <div className="space-y-1.5 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-muted)] w-20 shrink-0">AI Oracle</span>
                <div className="flex-1 h-5 bg-[var(--card-hover)]/50 rounded-full overflow-hidden relative">
                  <div
                    className="h-full rounded-full bg-[var(--violet)]/60 transition-all"
                    style={{ width: `${Math.min(bet.aiProbability, 100)}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold">
                    {bet.aiProbability.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-muted)] w-20 shrink-0">Polymarket</span>
                <div className="flex-1 h-5 bg-[var(--card-hover)]/50 rounded-full overflow-hidden relative">
                  <div
                    className="h-full rounded-full bg-[var(--emerald)]/60 transition-all"
                    style={{ width: `${Math.min(bet.polymarketProbability, 100)}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold">
                    {bet.polymarketProbability.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Signal strength */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[var(--text-muted)]">Segnale:</span>
              <span className={`font-bold ${signalColor}`}>{signalDots} {signalLabel}</span>
            </div>
          </div>

          {/* Edge */}
          <div className={`text-center shrink-0 px-3 py-2 rounded-xl ${edgeBg} ring-1`}>
            <div className={`text-xl font-extrabold tabular-nums ${edgeColor}`}>
              {bet.edge > 0 ? '+' : ''}{bet.edge.toFixed(1)}%
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">Edge</div>
          </div>
        </div>
      </div>
    </Link>
  );
}

const THEME_STYLES: Record<string, { gradient: string; border: string; badge: string; accent: string }> = {
  champions: { gradient: 'from-blue-600/20 to-indigo-900/10', border: 'ring-blue-500/30', badge: 'bg-blue-500/20 text-blue-400', accent: 'var(--blue, #3b82f6)' },
  europe: { gradient: 'from-indigo-600/20 to-purple-900/10', border: 'ring-indigo-500/30', badge: 'bg-indigo-500/20 text-indigo-400', accent: 'var(--violet, #8b5cf6)' },
  serie_a: { gradient: 'from-emerald-600/20 to-green-900/10', border: 'ring-emerald-500/30', badge: 'bg-emerald-500/20 text-emerald-400', accent: 'var(--emerald, #10b981)' },
  serie_b: { gradient: 'from-teal-600/20 to-cyan-900/10', border: 'ring-teal-500/30', badge: 'bg-teal-500/20 text-teal-400', accent: 'var(--teal, #14b8a6)' },
  premier: { gradient: 'from-purple-600/20 to-fuchsia-900/10', border: 'ring-purple-500/30', badge: 'bg-purple-500/20 text-purple-400', accent: 'var(--violet, #8b5cf6)' },
  top5: { gradient: 'from-amber-600/20 to-orange-900/10', border: 'ring-amber-500/30', badge: 'bg-amber-500/20 text-amber-400', accent: 'var(--gold, #f59e0b)' },
  desp: { gradient: 'from-red-600/20 to-orange-900/10', border: 'ring-red-500/30', badge: 'bg-red-500/20 text-red-400', accent: 'var(--red, #ef4444)' },
};

function MultidayCard({ schedina, isFirst }: { schedina: MultidaySchedina; isFirst: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const style = THEME_STYLES[schedina.theme] || THEME_STYLES.top5;

  function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    const lines = [`${schedina.emoji} ${schedina.label.toUpperCase()} (${schedina.dateRange})`];
    schedina.bets.forEach((bet, i) => {
      const date = new Date(bet.utcDate).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' });
      lines.push(`${i + 1}. ${bet.homeTeam} vs ${bet.awayTeam} → ${bet.betLabel} (${date})`);
    });
    lines.push(`Prob. combinata: ${schedina.combinedProbability.toFixed(1)}%`);
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className={`glass-card overflow-hidden ring-1 ${style.border}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full p-5 bg-gradient-to-r ${style.gradient} hover:brightness-110 transition-all`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-black/20 backdrop-blur">
              <span className="text-2xl">{schedina.emoji}</span>
            </div>
            <div className="text-left">
              <div className="font-extrabold text-lg flex items-center gap-2">
                {schedina.label}
                {isFirst && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase animate-pulse">
                    TOP
                  </span>
                )}
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-0.5 flex items-center gap-2">
                <Calendar className="w-3 h-3" />
                {schedina.dateRange}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{schedina.description}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs text-[var(--text-muted)]">Prob. combinata</div>
              <div className="text-sm font-bold tabular-nums" style={{ color: style.accent }}>
                {schedina.combinedProbability.toFixed(1)}%
              </div>
            </div>
            <div className={`px-3 py-2 rounded-xl ${style.badge} text-center min-w-[60px]`}>
              <div className="text-lg font-extrabold tabular-nums">{schedina.betCount}</div>
              <div className="text-[9px] uppercase tracking-wider opacity-70">eventi</div>
            </div>
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          {schedina.bets.map((bet, i) => {
            const matchDate = new Date(bet.utcDate);
            const dateLabel = matchDate.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
            const timeLabel = matchDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={`${bet.matchId}-${bet.betType}`} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--card-hover)]/30 hover:bg-[var(--card-hover)]/50 transition-colors">
                <div className="text-center shrink-0 w-12">
                  <div className="text-[10px] text-[var(--text-muted)]">{dateLabel}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{timeLabel}</div>
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {bet.homeTeamCrest && <img src={bet.homeTeamCrest} alt="" className="w-5 h-5 object-contain shrink-0" />}
                    <span className="text-sm font-semibold truncate">{bet.homeTeam}</span>
                    <span className="text-xs text-[var(--text-muted)]">vs</span>
                    <span className="text-sm font-semibold truncate">{bet.awayTeam}</span>
                    {bet.awayTeamCrest && <img src={bet.awayTeamCrest} alt="" className="w-5 h-5 object-contain shrink-0" />}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-1 rounded-lg text-xs font-bold ${style.badge}`}>
                    {bet.betLabel}
                  </span>
                  <div className="text-right">
                    <div className="text-xs font-bold tabular-nums" style={{ color: style.accent }}>
                      {bet.probability.toFixed(0)}%
                    </div>
                    <div className="text-[9px] text-[var(--text-muted)]">
                      Score {bet.reliabilityScore.toFixed(0)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]/20">
            <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
              <span>Affidabilita media: <strong className="text-[var(--text-primary)]">{schedina.combinedReliability.toFixed(0)}/100</strong></span>
              <span>Prob. combinata: <strong style={{ color: style.accent }}>{schedina.combinedProbability.toFixed(1)}%</strong></span>
            </div>
            <button
              onClick={handleCopy}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[var(--card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Copy className="w-3 h-3" />
              {copied ? 'Copiata!' : 'Copia'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SchedinePage() {
  const [topBets, setTopBets] = useState<SuggestedBet[]>([]);
  const [schedine, setSchedine] = useState<Schedina[]>([]);
  const [schedineX, setSchedineX] = useState<SchedinaX[]>([]);
  const [xStats, setXStats] = useState<SchedinaXResponse['stats'] | null>(null);
  const [valueBets, setValueBets] = useState<ValueBet[]>([]);
  const [multidaySchedine, setMultidaySchedine] = useState<MultidaySchedina[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'schedine' | 'multiday' | 'schedinex' | 'ranking' | 'valuebets'>('schedine');

  useEffect(() => {
    async function load() {
      try {
        const [betsRes, xRes, vbRes, mdRes] = await Promise.all([
          fetch('/api/predictions/suggested-bets'),
          fetch('/api/predictions/schedina-x'),
          fetch('/api/predictions/value-bets'),
          fetch('/api/predictions/schedine-multiday'),
        ]);
        if (betsRes.ok) {
          const data = await betsRes.json();
          setTopBets(data.topBets || []);
          setSchedine(data.schedine || []);
        }
        if (xRes.ok) {
          const xData: SchedinaXResponse = await xRes.json();
          setSchedineX(xData.schedineX || []);
          setXStats(xData.stats || null);
        }
        if (vbRes.ok) {
          const vbData = await vbRes.json();
          setValueBets(vbData.valueBets || []);
        }
        if (mdRes.ok) {
          const mdData = await mdRes.json();
          setMultidaySchedine(mdData.schedine || []);
        }
        // Auto-save schedine to DB (fire and forget)
        fetch('/api/schedine/save', { method: 'POST' }).catch(() => {});
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <Star className="w-6 h-6 text-[var(--gold)]" />
            Schedine AI
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Suggerimenti basati su AI + dati storici + mercati blockchain Polymarket
          </p>
        </div>
        <Link
          href="/schedine/storico"
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--card-hover)] border border-[var(--border)] transition-all flex items-center gap-2"
        >
          <BarChart3 className="w-4 h-4" />
          <span className="hidden sm:inline">Storico</span>
        </Link>
      </div>

      {/* Legend */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-[var(--violet)]" />
          <span className="text-sm font-bold">Come funziona il punteggio</span>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Ogni scommessa ha un punteggio di affidabilita (0-100) calcolato su: 40% accuratezza storica del mercato, 35% probabilita AI, 25% conferma Polymarket. Europa/Conference League escluse (troppo imprevedibili).
        </p>
      </div>

      {/* View toggle */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setView('schedine')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
            view === 'schedine'
              ? 'bg-[var(--violet)] text-white shadow-lg shadow-violet/25'
              : 'bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--card-hover)] border border-[var(--border)]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Trophy className="w-4 h-4" />
            <span className="hidden sm:inline">Schedine del giorno</span>
            <span className="sm:hidden">Schedine</span>
          </div>
        </button>
        <button
          onClick={() => setView('multiday')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
            view === 'multiday'
              ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
              : 'bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--card-hover)] border border-[var(--border)]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Blocks className="w-4 h-4" />
            <span className="hidden sm:inline">Multi-Day</span>
            <span className="sm:hidden">Multi</span>
            {multidaySchedine.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20">{multidaySchedine.length}</span>
            )}
          </div>
        </button>
        <button
          onClick={() => setView('schedinex')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
            view === 'schedinex'
              ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/25'
              : 'bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--card-hover)] border border-[var(--border)]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Equal className="w-4 h-4" />
            <span className="hidden sm:inline">Schedina X</span>
            <span className="sm:hidden">X</span>
          </div>
        </button>
        <button
          onClick={() => setView('ranking')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
            view === 'ranking'
              ? 'bg-[var(--violet)] text-white shadow-lg shadow-violet/25'
              : 'bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--card-hover)] border border-[var(--border)]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" />
            <span className="hidden sm:inline">Ranking scommesse</span>
            <span className="sm:hidden">Ranking</span>
          </div>
        </button>
        <button
          onClick={() => setView('valuebets')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
            view === 'valuebets'
              ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/25'
              : 'bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--card-hover)] border border-[var(--border)]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Diamond className="w-4 h-4" />
            <span className="hidden sm:inline">Value Bets</span>
            <span className="sm:hidden">Value</span>
          </div>
        </button>
      </div>

      {/* Schedine view */}
      {view === 'schedine' && (
        <div className="space-y-6">
          {schedine.length > 0 ? (
            (() => {
              // Group by date
              const dates = [...new Set(schedine.map(s => s.date))];
              return dates.map((date, di) => (
                <div key={date}>
                  <h2 className="text-lg font-extrabold mb-3 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-[var(--violet)]" />
                    {formatDate(date)}
                    {di === 0 && <span className="text-xs text-[var(--gold)] font-normal ml-2">Prossimo giorno</span>}
                  </h2>
                  <div className="space-y-3">
                    {schedine.filter(s => s.date === date).map((s, i) => (
                      <SchedinaCard key={`${s.date}-${s.type}`} schedina={s} isFirst={di === 0 && i === 0} />
                    ))}
                  </div>
                </div>
              ));
            })()
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

      {/* Multi-Day view */}
      {view === 'multiday' && (
        <div className="space-y-6">
          <div className="glass-card p-4 ring-1 ring-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Blocks className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-bold text-blue-400">Schedine Multi-Day — Per Competizione</span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Schedine tematiche che aggregano le migliori scommesse su piu giornate per competizione.
              Solo i pronostici con il punteggio piu alto vengono inclusi — massima probabilita di vittoria.
            </p>
          </div>

          {multidaySchedine.length > 0 ? (
            <div className="space-y-4">
              {multidaySchedine.map((ms, i) => (
                <MultidayCard key={ms.id} schedina={ms} isFirst={i === 0} />
              ))}
            </div>
          ) : (
            <div className="glass-card p-12 text-center">
              <Blocks className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">Nessuna schedina multi-day disponibile</h3>
              <p className="text-[var(--text-secondary)] text-sm">
                Servono pronostici su piu giornate per la stessa competizione per generare schedine tematiche.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Schedina X view */}
      {view === 'schedinex' && (
        <div className="space-y-6">
          {/* Info card */}
          <div className="glass-card p-4 ring-1 ring-amber-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Equal className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold text-amber-400">Schedina X — Pareggi</span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Algoritmo statistico basato su: tasso pareggi per campionato, equilibrio tra squadre, tendenza Under,
              dati storici e conferma Polymarket. Le X pagano quote alte — basta indovinarne 3 per un ottimo ritorno.
            </p>
            {xStats && (
              <div className="flex gap-4 mt-2 text-xs">
                <span className="text-[var(--text-muted)]">
                  Partite analizzate: <span className="font-bold text-amber-400">{xStats.totalMatchesAnalyzed}</span>
                </span>
                <span className="text-[var(--text-muted)]">
                  Con segnale X: <span className="font-bold text-amber-400">{xStats.matchesWithDrawSignal}</span>
                </span>
                <span className="text-[var(--text-muted)]">
                  Draw Score medio: <span className="font-bold text-amber-400">{xStats.averageDrawScore.toFixed(0)}</span>
                </span>
              </div>
            )}
          </div>

          {schedineX.length > 0 ? (
            schedineX.map((sx, i) => (
              <SchedinaXCard key={sx.tier} schedina={sx} isFirst={i === 0} />
            ))
          ) : (
            <div className="glass-card p-12 text-center">
              <Equal className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">Nessuna Schedina X disponibile</h3>
              <p className="text-[var(--text-secondary)] text-sm">
                Servono partite con pronostici nei prossimi 3 giorni per generare le schedine pareggio.
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

      {/* Value Bets view */}
      {view === 'valuebets' && (
        <div className="space-y-6">
          {/* Info card */}
          <div className="glass-card p-4 ring-1 ring-emerald-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Diamond className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-bold text-emerald-400">Value Bets — AI vs Polymarket</span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Partite dove la probabilita AI differisce significativamente dalle quote Polymarket.
              <strong className="text-emerald-400"> VALUE</strong> = AI piu ottimista del mercato (possibile valore).
              <strong className="text-red-400"> CAUTION</strong> = AI meno ottimista del mercato (il mercato sopravvaluta).
              Soglia minima: 8% di edge.
            </p>
          </div>

          {valueBets.length > 0 ? (
            <div className="space-y-3">
              {valueBets.map((vb) => (
                <ValueBetCard key={`${vb.matchId}-${vb.marketType}`} bet={vb} />
              ))}
            </div>
          ) : (
            <div className="glass-card p-12 text-center">
              <Diamond className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">Nessuna value bet trovata</h3>
              <p className="text-[var(--text-secondary)] text-sm">
                Non ci sono partite con edge significativo tra AI e Polymarket nei prossimi 7 giorni.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
