import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, teams, competitions, predictions, marketOdds } from '@/src/lib/db/schema';
import { eq, gte, asc, and, inArray } from 'drizzle-orm';

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

const BET_LABELS: Record<string, string> = {
  '1X2_HOME': 'Vittoria Casa (1)',
  '1X2_AWAY': 'Vittoria Trasferta (2)',
  'OVER_25': 'Over 2.5 Gol',
  'UNDER_25': 'Under 2.5 Gol',
  'OVER_15': 'Over 1.5 Gol',
  'BTTS_YES': 'GG (Goal)',
  'BTTS_NO': 'NG (No Goal)',
  'DC_1X': 'Doppia Chance 1X',
  'DC_X2': 'Doppia Chance X2',
};

// Competition groups for themed schedine
const THEMES = [
  {
    id: 'champions',
    label: 'Champions League',
    emoji: '🏆',
    theme: 'champions',
    competitionIds: [2001],
    description: 'Le migliori scommesse delle serate Champions',
    minBets: 2,
    maxBets: 4,
    minScore: 50,
  },
  {
    id: 'coppe_europee',
    label: 'Coppe Europee',
    emoji: '🌍',
    theme: 'europe',
    competitionIds: [2001, 2, 848],
    description: 'Champions + Europa League + Conference — il meglio delle coppe',
    minBets: 3,
    maxBets: 5,
    minScore: 45,
  },
  {
    id: 'serie_a',
    label: 'Serie A Weekend',
    emoji: '🇮🇹',
    theme: 'serie_a',
    competitionIds: [2019],
    description: 'Le scommesse piu sicure del campionato italiano',
    minBets: 2,
    maxBets: 4,
    minScore: 50,
  },
  {
    id: 'serie_b',
    label: 'Serie B Multi-Day',
    emoji: '🇮🇹',
    theme: 'serie_b',
    competitionIds: [136],
    description: 'Il meglio della cadetteria su piu giornate',
    minBets: 2,
    maxBets: 4,
    minScore: 45,
  },
  {
    id: 'premier_league',
    label: 'Premier League',
    emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    theme: 'premier',
    competitionIds: [2021],
    description: 'Le migliori scommesse della Premier inglese',
    minBets: 2,
    maxBets: 4,
    minScore: 50,
  },
  {
    id: 'top5',
    label: 'Top 5 Leghe',
    emoji: '⭐',
    theme: 'top5',
    competitionIds: [2019, 2021, 2002, 2015, 2014],
    description: 'Il meglio da Serie A, Premier, Bundesliga, Liga e Ligue 1',
    minBets: 3,
    maxBets: 5,
    minScore: 52,
  },
  {
    id: 'bundesliga_liga',
    label: 'Bundesliga + La Liga',
    emoji: '🇩🇪🇪🇸',
    theme: 'desp',
    competitionIds: [2002, 2014],
    description: 'Le scommesse piu forti da Germania e Spagna',
    minBets: 2,
    maxBets: 4,
    minScore: 48,
  },
];

export async function GET() {
  try {
    // Fetch historical accuracy
    const accRes = await fetch(
      `${process.env.NEXTAUTH_URL || 'http://localhost:3005'}/api/predictions/accuracy-by-competition`
    ).catch(() => null);
    const accuracyData: Array<{ competitionId: number; marketType: string; accuracy: number }> = accRes?.ok ? await accRes.json() : [];
    const accuracyMap = new Map<string, number>();
    for (const row of accuracyData) {
      accuracyMap.set(`${row.competitionId}_${row.marketType}`, row.accuracy);
    }

    // Get upcoming matches with predictions (next 10 days for multi-day)
    const now = new Date();
    const tenDaysFromNow = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

    const upcomingPreds = await db
      .select({ prediction: predictions, match: matches })
      .from(predictions)
      .innerJoin(matches, eq(predictions.matchId, matches.id))
      .where(and(gte(matches.utcDate, now)))
      .orderBy(asc(matches.utcDate))
      .limit(300);

    const filtered = upcomingPreds.filter(r => new Date(r.match.utcDate) <= tenDaysFromNow);

    // Build enriched bet candidates (same logic as suggested-bets but all competitions)
    interface BetCandidate {
      matchId: number;
      homeTeam: string;
      awayTeam: string;
      homeTeamCrest: string | null;
      awayTeamCrest: string | null;
      competition: string;
      competitionCode: string;
      competitionId: number;
      utcDate: string;
      betType: string;
      betLabel: string;
      betValue: string;
      probability: number;
      reliabilityScore: number;
      reasoning: string;
    }

    const allCandidates: BetCandidate[] = [];

    for (const { prediction: pred, match } of filtered) {
      const homeTeam = await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1).then(r => r[0]);
      const awayTeam = await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1).then(r => r[0]);
      const comp = await db.select().from(competitions).where(eq(competitions.id, match.competitionId)).limit(1).then(r => r[0]);
      if (!homeTeam || !awayTeam || !comp) continue;

      const mktOdds = await db.select().from(marketOdds).where(eq(marketOdds.matchId, match.id)).limit(1).then(r => r[0] ?? null);

      const homeProb = parseFloat(pred.homeWinProbability);
      const drawProb = parseFloat(pred.drawProbability);
      const awayProb = parseFloat(pred.awayWinProbability);
      const over25 = pred.over25Probability ? parseFloat(pred.over25Probability) : null;
      const bttsYes = pred.bttsYesProbability ? parseFloat(pred.bttsYesProbability) : null;
      const over15 = pred.over15Probability ? parseFloat(pred.over15Probability) : null;

      const base = {
        matchId: match.id,
        homeTeam: homeTeam.shortName || homeTeam.name,
        awayTeam: awayTeam.shortName || awayTeam.name,
        homeTeamCrest: homeTeam.crest,
        awayTeamCrest: awayTeam.crest,
        competition: comp.name,
        competitionCode: comp.code,
        competitionId: match.competitionId,
        utcDate: match.utcDate.toISOString(),
      };

      function calcScore(prob: number, marketType: string, mktProb: number | null): number {
        const histAcc = accuracyMap.get(`${match.competitionId}_${marketType}`) || 50;
        const marketAgreement = mktProb !== null ? (1 - Math.abs(prob / 100 - mktProb) / 0.5) * 100 : 50;
        return (prob * 0.35) + (histAcc * 0.40) + (Math.max(0, marketAgreement) * 0.25);
      }

      // HOME
      if (homeProb >= 50) {
        const mktP = mktOdds?.homeWinProb ? parseFloat(mktOdds.homeWinProb) : null;
        allCandidates.push({
          ...base, betType: '1X2_HOME', betLabel: BET_LABELS['1X2_HOME'],
          betValue: base.homeTeam, probability: homeProb,
          reliabilityScore: calcScore(homeProb, '1X2', mktP) + 5,
          reasoning: `${base.homeTeam} favorita al ${homeProb.toFixed(0)}%`,
        });
      }

      // AWAY
      if (awayProb >= 50) {
        const mktP = mktOdds?.awayWinProb ? parseFloat(mktOdds.awayWinProb) : null;
        allCandidates.push({
          ...base, betType: '1X2_AWAY', betLabel: BET_LABELS['1X2_AWAY'],
          betValue: base.awayTeam, probability: awayProb,
          reliabilityScore: calcScore(awayProb, '1X2', mktP) - 5,
          reasoning: `${base.awayTeam} favorita al ${awayProb.toFixed(0)}%`,
        });
      }

      // DC_1X
      if (homeProb + drawProb >= 75 && homeProb < 60 && awayProb < 20) {
        allCandidates.push({
          ...base, betType: 'DC_1X', betLabel: BET_LABELS['DC_1X'],
          betValue: `${base.homeTeam} o X`, probability: homeProb + drawProb,
          reliabilityScore: calcScore(homeProb + drawProb, '1X2', null) * 0.95,
          reasoning: `1X copre ${(homeProb + drawProb).toFixed(0)}%`,
        });
      }

      // DC_X2
      if (awayProb + drawProb >= 75 && awayProb < 60 && homeProb < 20) {
        allCandidates.push({
          ...base, betType: 'DC_X2', betLabel: BET_LABELS['DC_X2'],
          betValue: `X o ${base.awayTeam}`, probability: awayProb + drawProb,
          reliabilityScore: calcScore(awayProb + drawProb, '1X2', null) * 0.95,
          reasoning: `X2 copre ${(awayProb + drawProb).toFixed(0)}%`,
        });
      }

      // OVER 2.5
      if (over25 !== null && over25 >= 68) {
        const mktP = mktOdds?.over25Prob ? parseFloat(mktOdds.over25Prob) : null;
        allCandidates.push({
          ...base, betType: 'OVER_25', betLabel: BET_LABELS['OVER_25'],
          betValue: 'Over 2.5', probability: over25,
          reliabilityScore: calcScore(over25, 'OVER_25', mktP),
          reasoning: `Alta probabilita 3+ gol (${over25.toFixed(0)}%)`,
        });
      }

      // UNDER 2.5
      if (over25 !== null && over25 <= 40) {
        allCandidates.push({
          ...base, betType: 'UNDER_25', betLabel: BET_LABELS['UNDER_25'],
          betValue: 'Under 2.5', probability: 100 - over25,
          reliabilityScore: calcScore(100 - over25, 'OVER_25', null),
          reasoning: `Partita da pochi gol (${(100 - over25).toFixed(0)}%)`,
        });
      }

      // BTTS YES
      if (bttsYes !== null && bttsYes >= 60) {
        allCandidates.push({
          ...base, betType: 'BTTS_YES', betLabel: BET_LABELS['BTTS_YES'],
          betValue: 'Goal', probability: bttsYes,
          reliabilityScore: calcScore(bttsYes, 'BTTS', null),
          reasoning: `Entrambe segnano (${bttsYes.toFixed(0)}%)`,
        });
      }

      // BTTS NO
      if (bttsYes !== null && bttsYes <= 40) {
        allCandidates.push({
          ...base, betType: 'BTTS_NO', betLabel: BET_LABELS['BTTS_NO'],
          betValue: 'No Goal', probability: 100 - bttsYes,
          reliabilityScore: calcScore(100 - bttsYes, 'BTTS', null),
          reasoning: `Almeno una non segna (${(100 - bttsYes).toFixed(0)}%)`,
        });
      }

      // OVER 1.5
      if (over15 !== null && over15 >= 75) {
        allCandidates.push({
          ...base, betType: 'OVER_15', betLabel: BET_LABELS['OVER_15'],
          betValue: 'Over 1.5', probability: over15,
          reliabilityScore: calcScore(over15, 'OVER_25', null) * 0.9,
          reasoning: `Quasi certo 2+ gol (${over15.toFixed(0)}%)`,
        });
      }
    }

    // Sort all candidates by reliability
    allCandidates.sort((a, b) => b.reliabilityScore - a.reliabilityScore);

    // Build themed schedine
    const schedine: MultidaySchedina[] = [];

    for (const theme of THEMES) {
      // Filter candidates for this theme's competitions
      const themeCandidates = allCandidates.filter(c =>
        theme.competitionIds.includes(c.competitionId)
      );

      if (themeCandidates.length < theme.minBets) continue;

      // Pick diverse bets (different matches, mixed bet types)
      const picked: BetCandidate[] = [];
      const usedMatches = new Set<number>();
      const usedTypes = new Map<string, number>();

      for (const bet of themeCandidates) {
        if (picked.length >= theme.maxBets) break;
        if (usedMatches.has(bet.matchId)) continue;
        if (bet.reliabilityScore < theme.minScore) continue;

        // Type diversity bonus
        const typeCount = usedTypes.get(bet.betType) || 0;
        if (typeCount >= 2) continue; // Max 2 of same type

        picked.push(bet);
        usedMatches.add(bet.matchId);
        usedTypes.set(bet.betType, typeCount + 1);
      }

      if (picked.length < theme.minBets) continue;

      // Calculate date range
      const dates = [...new Set(picked.map(b => b.utcDate.split('T')[0]))].sort();
      const dateRange = dates.length === 1
        ? formatDateIT(dates[0])
        : `${formatDateIT(dates[0])} — ${formatDateIT(dates[dates.length - 1])}`;

      const combinedProb = picked.reduce((p, b) => p * (b.probability / 100), 1) * 100;
      const avgReliability = picked.reduce((s, b) => s + b.reliabilityScore, 0) / picked.length;

      const competitionCodes = [...new Set(picked.map(b => b.competitionCode))];

      schedine.push({
        id: theme.id,
        label: theme.label,
        emoji: theme.emoji,
        theme: theme.theme,
        description: theme.description,
        dateRange,
        competitionCodes,
        bets: picked.map(b => ({
          matchId: b.matchId,
          homeTeam: b.homeTeam,
          awayTeam: b.awayTeam,
          homeTeamCrest: b.homeTeamCrest,
          awayTeamCrest: b.awayTeamCrest,
          competition: b.competition,
          competitionCode: b.competitionCode,
          utcDate: b.utcDate,
          betType: b.betType,
          betLabel: b.betLabel,
          betValue: b.betValue,
          probability: b.probability,
          reliabilityScore: b.reliabilityScore,
          reasoning: b.reasoning,
        })),
        combinedProbability: combinedProb,
        combinedReliability: avgReliability,
        betCount: picked.length,
      });
    }

    // Sort by combined reliability (best first)
    schedine.sort((a, b) => b.combinedReliability - a.combinedReliability);

    return NextResponse.json({ schedine, totalCandidates: allCandidates.length });
  } catch (error) {
    console.error('Error generating multiday schedine:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate multiday schedine' } },
      { status: 500 }
    );
  }
}

function formatDateIT(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
}
