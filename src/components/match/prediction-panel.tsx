'use client';

import { ThreeWayBar, ProbabilityBar } from '@/src/components/shared/probability-bar';
import { Target, TrendingUp, AlertTriangle, CornerDownRight, CreditCard, Zap, Star } from 'lucide-react';

interface PredictionPanelProps {
  prediction: {
    predictedWinner: string;
    homeWinProbability: string;
    drawProbability: string;
    awayWinProbability: string;
    confidence: string;
    doubleChance?: string | null;
    predictedHomeScore?: string | null;
    predictedAwayScore?: string | null;
    // Over/Under
    over15Probability?: string | null;
    over25Probability?: string | null;
    over35Probability?: string | null;
    under15Probability?: string | null;
    under25Probability?: string | null;
    under35Probability?: string | null;
    // BTTS
    bttsYesProbability?: string | null;
    bttsNoProbability?: string | null;
    // Half-time
    predictedWinnerHT?: string | null;
    homeWinProbabilityHT?: string | null;
    drawProbabilityHT?: string | null;
    awayWinProbabilityHT?: string | null;
    predictedHomeScoreHT?: string | null;
    predictedAwayScoreHT?: string | null;
    over05HTProb?: string | null;
    over15HTProb?: string | null;
    bttsHTProb?: string | null;
    // Cards & Corners
    predictedTotalCards?: string | null;
    totalCardsOver25Prob?: string | null;
    totalCardsOver45Prob?: string | null;
    predictedTotalCorners?: string | null;
    totalCornersOver85Prob?: string | null;
    totalCornersOver105Prob?: string | null;
    isRoughMatch?: boolean | null;
    // Key factors & recommended bets
    keyFactors?: any;
    recommendedBets?: any;
  };
  homeTeamName?: string;
  awayTeamName?: string;
}

function p(val?: string | null): number {
  return val ? parseFloat(val) : 0;
}

function MarketCell({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  const color = value >= 65 ? 'text-[var(--emerald)]' : value >= 50 ? 'text-[var(--gold)]' : 'text-[var(--text-secondary)]';
  return (
    <div className={`glass-card p-3 text-center ${highlight ? 'ring-1 ring-[var(--emerald)]/50' : ''}`}>
      <div className="text-xs text-[var(--text-muted)] mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value.toFixed(1)}%</div>
    </div>
  );
}

export function PredictionPanel({ prediction, homeTeamName = 'Casa', awayTeamName = 'Trasferta' }: PredictionPanelProps) {
  const pred = prediction;
  const homeWin = p(pred.homeWinProbability);
  const draw = p(pred.drawProbability);
  const awayWin = p(pred.awayWinProbability);
  const confidence = p(pred.confidence);

  const rawBets: any[] = Array.isArray(pred.recommendedBets) ? pred.recommendedBets : [];
  const recommendedBets = rawBets.map(b => ({
    bet: b.bet || b.value || b.type || '',
    reasoning: b.reasoning || b.reason || '',
    confidence: b.confidence || null,
    type: b.type || '',
  }));
  const keyFactors: string[] = Array.isArray(pred.keyFactors) ? pred.keyFactors : [];

  return (
    <div className="space-y-6">
      {/* 1X2 Main */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold flex items-center gap-2">
            <Target className="w-4 h-4 text-[var(--violet)]" />
            Esito Finale (1X2)
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">Confidenza</span>
            <span className={`text-sm font-bold ${confidence >= 70 ? 'text-[var(--emerald)]' : confidence >= 50 ? 'text-[var(--gold)]' : 'text-[var(--text-secondary)]'}`}>
              {confidence.toFixed(0)}%
            </span>
          </div>
        </div>

        <ThreeWayBar homeValue={homeWin} drawValue={draw} awayValue={awayWin}
          homeLabel={homeTeamName} drawLabel="Pareggio" awayLabel={awayTeamName} />

        {/* Predicted score */}
        {pred.predictedHomeScore && pred.predictedAwayScore && (
          <div className="mt-4 text-center">
            <span className="text-xs text-[var(--text-muted)]">Risultato previsto</span>
            <div className="text-2xl font-extrabold mt-1">
              <span className="text-[var(--emerald)]">{parseFloat(pred.predictedHomeScore).toFixed(1)}</span>
              <span className="text-[var(--text-muted)] mx-2">-</span>
              <span className="text-[var(--red)]">{parseFloat(pred.predictedAwayScore).toFixed(1)}</span>
            </div>
          </div>
        )}

        {/* Double chance */}
        {pred.doubleChance && (
          <div className="mt-3 text-center">
            <span className="px-3 py-1 rounded-full bg-[var(--violet)]/10 text-[var(--violet)] text-sm font-medium">
              Doppia chance: {pred.doubleChance}
            </span>
          </div>
        )}
      </div>

      {/* Over/Under Grid */}
      <div className="glass-card p-5">
        <h3 className="font-bold flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-[var(--emerald)]" />
          Over / Under
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {pred.over15Probability && <MarketCell label="Over 1.5" value={p(pred.over15Probability)} highlight={p(pred.over15Probability) >= 65} />}
          {pred.over25Probability && <MarketCell label="Over 2.5" value={p(pred.over25Probability)} highlight={p(pred.over25Probability) >= 60} />}
          {pred.over35Probability && <MarketCell label="Over 3.5" value={p(pred.over35Probability)} highlight={p(pred.over35Probability) >= 55} />}
          {pred.under15Probability && <MarketCell label="Under 1.5" value={p(pred.under15Probability)} />}
          {pred.under25Probability && <MarketCell label="Under 2.5" value={p(pred.under25Probability)} />}
          {pred.under35Probability && <MarketCell label="Under 3.5" value={p(pred.under35Probability)} />}
        </div>
      </div>

      {/* BTTS */}
      {(pred.bttsYesProbability || pred.bttsNoProbability) && (
        <div className="glass-card p-5">
          <h3 className="font-bold mb-4">GG / NG (Goal / No Goal)</h3>
          <div className="grid grid-cols-2 gap-3">
            {pred.bttsYesProbability && <MarketCell label="GG (Goal)" value={p(pred.bttsYesProbability)} highlight={p(pred.bttsYesProbability) >= 60} />}
            {pred.bttsNoProbability && <MarketCell label="NG (No Goal)" value={p(pred.bttsNoProbability)} />}
          </div>
        </div>
      )}

      {/* Half-time */}
      {pred.homeWinProbabilityHT && (
        <div className="glass-card p-5">
          <h3 className="font-bold flex items-center gap-2 mb-4">
            <CornerDownRight className="w-4 h-4 text-[var(--blue)]" />
            Primo Tempo
          </h3>

          <ThreeWayBar
            homeValue={p(pred.homeWinProbabilityHT)}
            drawValue={p(pred.drawProbabilityHT)}
            awayValue={p(pred.awayWinProbabilityHT)}
            homeLabel="1" drawLabel="X" awayLabel="2"
          />

          {pred.predictedHomeScoreHT && pred.predictedAwayScoreHT && (
            <div className="mt-3 text-center text-sm">
              <span className="text-[var(--text-muted)]">Parziale: </span>
              <span className="font-bold">{parseFloat(pred.predictedHomeScoreHT).toFixed(1)} - {parseFloat(pred.predictedAwayScoreHT).toFixed(1)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
            {pred.over05HTProb && <MarketCell label="Over 0.5 PT" value={p(pred.over05HTProb)} />}
            {pred.over15HTProb && <MarketCell label="Over 1.5 PT" value={p(pred.over15HTProb)} />}
            {pred.bttsHTProb && <MarketCell label="GG PT" value={p(pred.bttsHTProb)} />}
          </div>
        </div>
      )}

      {/* Cards & Corners */}
      {(pred.predictedTotalCards || pred.predictedTotalCorners) && (
        <div className="glass-card p-5">
          <h3 className="font-bold flex items-center gap-2 mb-4">
            <CreditCard className="w-4 h-4 text-[var(--gold)]" />
            Cartellini &amp; Calci d&apos;Angolo
            {pred.isRoughMatch && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-[var(--red)]/10 text-[var(--red)] text-xs font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Partita dura
              </span>
            )}
          </h3>

          <div className="grid grid-cols-2 gap-6">
            {/* Cards */}
            {pred.predictedTotalCards && (
              <div>
                <div className="text-sm text-[var(--text-muted)] mb-2">
                  Cartellini previsti: <span className="font-bold text-white">{parseFloat(pred.predictedTotalCards).toFixed(1)}</span>
                </div>
                <div className="space-y-2">
                  {pred.totalCardsOver25Prob && (
                    <ProbabilityBar label="Over 2.5" value={p(pred.totalCardsOver25Prob)} color="gold" size="sm" />
                  )}
                  {pred.totalCardsOver45Prob && (
                    <ProbabilityBar label="Over 4.5" value={p(pred.totalCardsOver45Prob)} color="gold" size="sm" />
                  )}
                </div>
              </div>
            )}

            {/* Corners */}
            {pred.predictedTotalCorners && (
              <div>
                <div className="text-sm text-[var(--text-muted)] mb-2">
                  Corner previsti: <span className="font-bold text-white">{parseFloat(pred.predictedTotalCorners).toFixed(1)}</span>
                </div>
                <div className="space-y-2">
                  {pred.totalCornersOver85Prob && (
                    <ProbabilityBar label="Over 8.5" value={p(pred.totalCornersOver85Prob)} color="blue" size="sm" />
                  )}
                  {pred.totalCornersOver105Prob && (
                    <ProbabilityBar label="Over 10.5" value={p(pred.totalCornersOver105Prob)} color="blue" size="sm" />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recommended Bets */}
      {recommendedBets.length > 0 && (
        <div className="glass-card p-5 ring-1 ring-[var(--emerald)]/20">
          <h3 className="font-bold flex items-center gap-2 mb-4 text-[var(--emerald)]">
            <Star className="w-4 h-4" />
            Scommesse Raccomandate
          </h3>
          <div className="space-y-2">
            {recommendedBets.map((bet, i) => {
              const isGoal = bet.type.includes('btts') || bet.type.includes('over') || bet.type.includes('under');
              const is1x2 = bet.type.includes('1X2') || bet.type.includes('draw');
              const isCards = bet.type.includes('card') || bet.type.includes('Card');
              const isCorners = bet.type.includes('corner') || bet.type.includes('Corner');
              const Icon = isCards ? CreditCard : isCorners ? CornerDownRight : isGoal ? TrendingUp : is1x2 ? Target : Zap;
              const color = is1x2 ? 'var(--violet)' : isGoal ? 'var(--emerald)' : isCards ? 'var(--gold)' : isCorners ? 'var(--blue)' : 'var(--emerald)';

              return (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[var(--card-hover)]/50 hover:bg-[var(--card-hover)] transition-colors">
                  <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm" style={{ color }}>{bet.bet}</div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">{bet.reasoning}</div>
                  </div>
                  {bet.confidence && (
                    <span className="text-sm font-bold tabular-nums" style={{ color }}>{bet.confidence}%</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Key Factors */}
      {keyFactors.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="font-bold mb-4">Fattori Chiave</h3>
          <ul className="space-y-2">
            {keyFactors.map((factor, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--violet)] mt-1.5 shrink-0" />
                {factor}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
