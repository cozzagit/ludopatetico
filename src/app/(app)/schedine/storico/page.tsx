'use client';

import { useEffect, useState } from 'react';
import {
  Loader2, Trophy, TrendingUp, TrendingDown, Clock, CheckCircle2, XCircle,
  Calendar, Shield, Target, Zap, Equal, ChevronDown, ChevronUp,
  BarChart3, Flame, ArrowLeft, RefreshCw
} from 'lucide-react';
import Link from 'next/link';

interface BetResult {
  matchId: number;
  correct: boolean | null;
  actualResult: string | null;
  matchStatus: string;
  homeScore: number | null;
  awayScore: number | null;
}

interface SavedBet {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamCrest?: string | null;
  awayTeamCrest?: string | null;
  competition: string;
  competitionCode: string;
  utcDate?: string;
  matchDate?: string;
  betType?: string;
  bet?: string;
  betLabel?: string;
  betValue?: string;
  probability?: number;
  drawProbability?: number;
  drawScore?: number;
  reliabilityScore?: number;
  signals?: string[];
  reasoning?: string;
}

interface SavedSchedina {
  id: string;
  type: string;
  label: string;
  generatedAt: string;
  targetDate: string;
  bets: SavedBet[];
  combinedProbability: string | null;
  totalBets: number;
  checkedAt: string | null;
  correctBets: number | null;
  wrongBets: number | null;
  pendingBets: number | null;
  isWin: boolean | null;
  betResults: BetResult[] | null;
}

interface TypeStats {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
}

interface HistoryResponse {
  schedine: SavedSchedina[];
  stats: {
    total: number;
    wins: number;
    losses: number;
    pending: number;
    winRate: number;
    streak: number;
    streakType: 'win' | 'loss' | 'none';
    typeStats: Record<string, TypeStats>;
  };
}

const TYPE_CONFIG: Record<string, {
  gradient: string;
  border: string;
  badge: string;
  accent: string;
  icon: typeof Shield;
  winGradient: string;
  lossGradient: string;
}> = {
  safe: {
    gradient: 'from-emerald-600/20 to-emerald-900/10',
    border: 'ring-emerald-500/30',
    badge: 'bg-emerald-500/20 text-emerald-400',
    accent: 'var(--emerald, #10b981)',
    icon: Shield,
    winGradient: 'from-emerald-600/30 to-emerald-900/10',
    lossGradient: 'from-red-600/20 to-red-900/10',
  },
  moderate: {
    gradient: 'from-blue-600/20 to-blue-900/10',
    border: 'ring-blue-500/30',
    badge: 'bg-blue-500/20 text-blue-400',
    accent: 'var(--blue, #3b82f6)',
    icon: Target,
    winGradient: 'from-emerald-600/30 to-blue-900/10',
    lossGradient: 'from-red-600/20 to-red-900/10',
  },
  bold: {
    gradient: 'from-orange-600/20 to-red-900/10',
    border: 'ring-orange-500/30',
    badge: 'bg-orange-500/20 text-orange-400',
    accent: 'var(--gold, #f59e0b)',
    icon: Zap,
    winGradient: 'from-emerald-600/30 to-orange-900/10',
    lossGradient: 'from-red-600/20 to-red-900/10',
  },
  X_SICURA: {
    gradient: 'from-amber-600/20 to-yellow-900/10',
    border: 'ring-amber-500/30',
    badge: 'bg-amber-500/20 text-amber-400',
    accent: 'var(--gold, #f59e0b)',
    icon: Equal,
    winGradient: 'from-emerald-600/30 to-amber-900/10',
    lossGradient: 'from-red-600/20 to-red-900/10',
  },
  X_BILANCIATA: {
    gradient: 'from-purple-600/20 to-purple-900/10',
    border: 'ring-purple-500/30',
    badge: 'bg-purple-500/20 text-purple-400',
    accent: 'var(--violet, #8b5cf6)',
    icon: Equal,
    winGradient: 'from-emerald-600/30 to-purple-900/10',
    lossGradient: 'from-red-600/20 to-red-900/10',
  },
  X_RISCHIOSA: {
    gradient: 'from-red-600/20 to-red-900/10',
    border: 'ring-red-500/30',
    badge: 'bg-red-500/20 text-red-400',
    accent: 'var(--red, #ef4444)',
    icon: Flame,
    winGradient: 'from-emerald-600/30 to-red-900/10',
    lossGradient: 'from-red-600/30 to-red-900/15',
  },
};

function getStatusInfo(schedina: SavedSchedina) {
  if (schedina.pendingBets && schedina.pendingBets > 0) {
    return { label: 'In corso', color: 'text-blue-400', bg: 'bg-blue-500/15', icon: Clock };
  }
  if (schedina.isWin === true) {
    return { label: 'VINTA', color: 'text-emerald-400', bg: 'bg-emerald-500/15', icon: CheckCircle2 };
  }
  if (schedina.isWin === false) {
    return { label: 'PERSA', color: 'text-red-400', bg: 'bg-red-500/15', icon: XCircle };
  }
  return { label: 'Pendente', color: 'text-gray-400', bg: 'bg-gray-500/15', icon: Clock };
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function SchedinaHistoryCard({ schedina }: { schedina: SavedSchedina }) {
  const [expanded, setExpanded] = useState(false);
  const config = TYPE_CONFIG[schedina.type] || TYPE_CONFIG.safe;
  const status = getStatusInfo(schedina);
  const StatusIcon = status.icon;
  const TypeIcon = config.icon;

  // Determine header gradient based on result
  let headerGradient = config.gradient;
  if (schedina.isWin === true) headerGradient = config.winGradient;
  else if (schedina.isWin === false) headerGradient = config.lossGradient;

  const betResults = schedina.betResults || [];

  return (
    <div className={`glass-card overflow-hidden ring-1 ${
      schedina.isWin === true ? 'ring-emerald-500/40' :
      schedina.isWin === false ? 'ring-red-500/30' :
      config.border
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full p-4 bg-gradient-to-r ${headerGradient} hover:brightness-110 transition-all`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-black/20 backdrop-blur">
              <TypeIcon className="w-5 h-5" style={{ color: config.accent }} />
            </div>
            <div className="text-left">
              <div className="font-extrabold text-sm flex items-center gap-2">
                {schedina.label}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${status.bg} ${status.color}`}>
                  <StatusIcon className="w-3 h-3 inline mr-0.5" />
                  {status.label}
                </span>
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-2">
                <Calendar className="w-3 h-3" />
                {formatDate(schedina.targetDate)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Score */}
            <div className="text-right">
              <div className="text-xs text-[var(--text-muted)]">Risultato</div>
              <div className="text-sm font-extrabold tabular-nums">
                <span className="text-emerald-400">{schedina.correctBets ?? 0}</span>
                <span className="text-[var(--text-muted)]">/</span>
                <span>{schedina.totalBets}</span>
                {schedina.pendingBets && schedina.pendingBets > 0 ? (
                  <span className="text-blue-400 ml-1">({schedina.pendingBets} ?)</span>
                ) : null}
              </div>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-[var(--border)]/20">
          {schedina.bets.map((bet, i) => {
            const result = betResults[i];
            const betType = bet.betType || bet.bet || 'X';
            const betLabel = bet.betLabel || (betType === 'X' ? 'Pareggio (X)' : betType);
            const matchDate = bet.utcDate || bet.matchDate || '';

            let resultIcon = <Clock className="w-4 h-4 text-gray-400" />;
            let resultBg = '';
            if (result?.correct === true) {
              resultIcon = <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
              resultBg = 'bg-emerald-500/5';
            } else if (result?.correct === false) {
              resultIcon = <XCircle className="w-4 h-4 text-red-400" />;
              resultBg = 'bg-red-500/5';
            }

            return (
              <div key={`${bet.matchId}-${betType}-${i}`} className={`p-3 ${resultBg} hover:bg-[var(--card-hover)]/30 transition-colors`}>
                <div className="flex items-center gap-3">
                  <div className="shrink-0">{resultIcon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {bet.homeTeamCrest && <img src={bet.homeTeamCrest} alt="" className="w-4 h-4 object-contain" />}
                      <span className="text-sm font-semibold">{bet.homeTeam}</span>
                      <span className="text-xs text-[var(--text-muted)]">vs</span>
                      <span className="text-sm font-semibold">{bet.awayTeam}</span>
                      {bet.awayTeamCrest && <img src={bet.awayTeamCrest} alt="" className="w-4 h-4 object-contain" />}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5">
                      <span>{bet.competition}</span>
                      {matchDate && (
                        <>
                          <span>-</span>
                          <span>{formatTime(matchDate)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${config.badge}`}>
                      {betLabel}
                    </div>
                    {result?.actualResult && result.matchStatus === 'FINISHED' && (
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                        {result.homeScore}-{result.awayScore}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Footer */}
          <div className="p-3 flex items-center justify-between text-xs bg-[var(--card-hover)]/20">
            <span className="text-[var(--text-muted)]">
              Prob. combinata: <span className="font-bold">{schedina.combinedProbability ? parseFloat(schedina.combinedProbability).toFixed(1) : '-'}%</span>
            </span>
            <span className="text-[var(--text-muted)]">
              Generata il {new Date(schedina.generatedAt).toLocaleDateString('it-IT')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StoricoPage() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState(30);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  async function loadHistory() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (typeFilter) params.set('type', typeFilter);
      const res = await fetch(`/api/schedine/history?${params}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveToday() {
    setSaving(true);
    try {
      await fetch('/api/schedine/save', { method: 'POST' });
      await loadHistory();
    } catch {
      // Silently handle
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckResults() {
    setChecking(true);
    try {
      await fetch('/api/schedine/check-results', { method: 'POST' });
      await loadHistory();
    } catch {
      // Silently handle
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, typeFilter]);

  const stats = data?.stats;
  const schedine = data?.schedine || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/schedine" className="p-2 rounded-lg hover:bg-[var(--card-hover)] transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-extrabold flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-[var(--violet)]" />
              Storico Schedine
            </h1>
          </div>
          <p className="text-[var(--text-secondary)] ml-11">
            Tracciamento performance e risultati delle schedine generate
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleSaveToday}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--violet)] text-white hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
          Salva schedine di oggi
        </button>
        <button
          onClick={handleCheckResults}
          disabled={checking}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--card-hover)] border border-[var(--border)] transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Verifica risultati
        </button>
      </div>

      {/* Stats overview */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-extrabold tabular-nums">{stats.total}</div>
            <div className="text-xs text-[var(--text-muted)]">Totali</div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-extrabold tabular-nums text-emerald-400">{stats.wins}</div>
            <div className="text-xs text-[var(--text-muted)]">Vinte</div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-extrabold tabular-nums text-red-400">{stats.losses}</div>
            <div className="text-xs text-[var(--text-muted)]">Perse</div>
          </div>
          <div className="glass-card p-4 text-center ring-1 ring-[var(--violet)]/30">
            <div className="text-2xl font-extrabold tabular-nums" style={{ color: 'var(--violet)' }}>
              {stats.winRate.toFixed(1)}%
            </div>
            <div className="text-xs text-[var(--text-muted)]">Win Rate</div>
          </div>
        </div>
      )}

      {/* Streak indicator */}
      {stats && stats.streak > 0 && (
        <div className={`glass-card p-3 flex items-center gap-2 text-sm ${
          stats.streakType === 'win' ? 'ring-1 ring-emerald-500/30' : 'ring-1 ring-red-500/30'
        }`}>
          {stats.streakType === 'win' ? (
            <TrendingUp className="w-5 h-5 text-emerald-400" />
          ) : (
            <TrendingDown className="w-5 h-5 text-red-400" />
          )}
          <span className="font-bold">
            Serie di {stats.streak} {stats.streakType === 'win' ? 'vittorie' : 'sconfitte'} consecutive
          </span>
        </div>
      )}

      {/* Per-type stats */}
      {stats && Object.keys(stats.typeStats).length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[var(--violet)]" />
            Performance per tipo
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(stats.typeStats).map(([type, ts]) => {
              const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.safe;
              const typeLabel = type === 'safe' ? 'Sicura' : type === 'moderate' ? 'Bilanciata' : type === 'bold' ? 'Rischiosa' :
                type === 'X_SICURA' ? 'X Sicura' : type === 'X_BILANCIATA' ? 'X Bilanciata' : type === 'X_RISCHIOSA' ? 'X Rischiosa' : type;
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                  className={`p-3 rounded-lg text-left transition-all ${
                    typeFilter === type ? 'ring-2 ring-[var(--violet)] bg-[var(--violet)]/10' : `${cfg.badge} bg-opacity-5`
                  }`}
                >
                  <div className="text-xs font-bold" style={{ color: cfg.accent }}>{typeLabel}</div>
                  <div className="text-lg font-extrabold tabular-nums mt-0.5">
                    {ts.winRate.toFixed(0)}%
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {ts.wins}V / {ts.losses}P{ts.pending > 0 ? ` / ${ts.pending}?` : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[var(--text-muted)]">Periodo:</span>
        {[7, 14, 30, 90].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              days === d
                ? 'bg-[var(--violet)] text-white'
                : 'bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--card-hover)] border border-[var(--border)]'
            }`}
          >
            {d}g
          </button>
        ))}
        {typeFilter && (
          <button
            onClick={() => setTypeFilter(null)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all"
          >
            Rimuovi filtro tipo
          </button>
        )}
      </div>

      {/* Schedine list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--violet)]" />
        </div>
      ) : schedine.length > 0 ? (
        <div className="space-y-3">
          {/* Group by date */}
          {(() => {
            const dates = [...new Set(schedine.map(s => s.targetDate))];
            return dates.map(date => (
              <div key={date}>
                <h3 className="text-sm font-bold text-[var(--text-muted)] mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {formatDate(date)}
                </h3>
                <div className="space-y-2 mb-4">
                  {schedine.filter(s => s.targetDate === date).map(s => (
                    <SchedinaHistoryCard key={s.id} schedina={s} />
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      ) : (
        <div className="glass-card p-12 text-center">
          <BarChart3 className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <h3 className="text-lg font-bold mb-2">Nessuna schedina salvata</h3>
          <p className="text-[var(--text-secondary)] text-sm mb-4">
            Clicca &quot;Salva schedine di oggi&quot; per iniziare a tracciare i risultati.
          </p>
        </div>
      )}
    </div>
  );
}
