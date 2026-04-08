'use client';

import Link from 'next/link';
import { Calendar, ChevronRight } from 'lucide-react';
import { CompetitionBadge } from '@/src/components/shared/competition-badge';
import { FormBadge } from '@/src/components/shared/form-badge';

interface MatchCardProps {
  match: {
    id: number;
    utcDate: string;
    status: string;
    homeScore?: number | null;
    awayScore?: number | null;
    homeTeam?: { name: string; shortName?: string | null; crest?: string | null } | null;
    awayTeam?: { name: string; shortName?: string | null; crest?: string | null } | null;
    competition?: { name: string; code: string; emblem?: string | null } | null;
    prediction?: {
      predictedWinner: string;
      homeWinProbability: string;
      drawProbability: string;
      awayWinProbability: string;
      confidence: string;
    } | null;
  };
  homeForm?: string;
  awayForm?: string;
  compact?: boolean;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return { day, time };
}

function getPredictionBadge(predicted: string) {
  switch (predicted) {
    case 'HOME_TEAM': return { label: '1', color: 'bg-[var(--emerald)]/20 text-[var(--emerald)]' };
    case 'DRAW': return { label: 'X', color: 'bg-[var(--gold)]/20 text-[var(--gold)]' };
    case 'AWAY_TEAM': return { label: '2', color: 'bg-[var(--red)]/20 text-[var(--red)]' };
    default: return { label: '?', color: 'bg-[var(--border)] text-[var(--text-muted)]' };
  }
}

export function MatchCard({ match, homeForm, awayForm, compact = false }: MatchCardProps) {
  const { day, time } = formatDate(match.utcDate);
  const isFinished = match.status === 'FINISHED';
  const isLive = match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const prediction = match.prediction;
  const predBadge = prediction ? getPredictionBadge(prediction.predictedWinner) : null;

  return (
    <Link href={`/matches/${match.id}`}
      className="glass-card block p-4 hover:bg-[var(--card-hover)] transition-all duration-200 group">
      {/* Top row: competition + date */}
      <div className="flex items-center justify-between mb-3">
        {match.competition && (
          <CompetitionBadge name={match.competition.name} code={match.competition.code} size="sm" />
        )}
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          {isLive && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--red)]/20 text-[var(--red)] font-bold animate-pulse">
              LIVE
            </span>
          )}
          <Calendar className="w-3 h-3" />
          <span>{day}</span>
          <span className="font-medium text-[var(--text-secondary)]">{time}</span>
        </div>
      </div>

      {/* Teams */}
      <div className="flex items-center gap-3">
        {/* Home team */}
        <div className="flex-1 text-right">
          <div className="flex items-center justify-end gap-2">
            {homeForm && !compact && <FormBadge form={homeForm} size="sm" />}
            <span className="font-semibold text-sm truncate">
              {match.homeTeam?.shortName || match.homeTeam?.name || 'TBD'}
            </span>
            {match.homeTeam?.crest && (
              <img src={match.homeTeam.crest} alt="" className="w-6 h-6 object-contain" />
            )}
          </div>
        </div>

        {/* Score / Time */}
        <div className="w-16 text-center shrink-0">
          {isFinished || isLive ? (
            <div className={`text-lg font-extrabold tabular-nums ${isLive ? 'text-[var(--red)]' : ''}`}>
              {match.homeScore ?? 0} - {match.awayScore ?? 0}
            </div>
          ) : (
            <div className="text-sm font-bold text-[var(--text-muted)]">{time}</div>
          )}
        </div>

        {/* Away team */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {match.awayTeam?.crest && (
              <img src={match.awayTeam.crest} alt="" className="w-6 h-6 object-contain" />
            )}
            <span className="font-semibold text-sm truncate">
              {match.awayTeam?.shortName || match.awayTeam?.name || 'TBD'}
            </span>
            {awayForm && !compact && <FormBadge form={awayForm} size="sm" />}
          </div>
        </div>
      </div>

      {/* Prediction row */}
      {prediction && !compact && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]/50">
          <div className="flex items-center gap-2">
            {predBadge && (
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${predBadge.color}`}>
                {predBadge.label}
              </span>
            )}
            <div className="flex items-center gap-3 text-xs tabular-nums">
              <span className="text-[var(--emerald)]">{parseFloat(prediction.homeWinProbability).toFixed(0)}%</span>
              <span className="text-[var(--text-muted)]">{parseFloat(prediction.drawProbability).toFixed(0)}%</span>
              <span className="text-[var(--red)]">{parseFloat(prediction.awayWinProbability).toFixed(0)}%</span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <span>Conf. {parseFloat(prediction.confidence).toFixed(0)}%</span>
            <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      )}
    </Link>
  );
}
