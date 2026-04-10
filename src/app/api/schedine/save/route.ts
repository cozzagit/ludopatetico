import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { savedSchedine } from '@/src/lib/db/schema';
import { and, eq } from 'drizzle-orm';

interface StandardBet {
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
  bets: StandardBet[];
  combinedReliability: number;
  combinedProbability: number;
}

interface XBet {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamCrest?: string | null;
  awayTeamCrest?: string | null;
  competition: string;
  competitionCode: string;
  matchDate: string;
  bet: 'X';
  drawScore: number;
  drawProbability: number;
  over25Probability: number | null;
  bttsProbability: number | null;
  polymarketDrawProb: number | null;
  signals: string[];
}

interface SchedinaX {
  tier: 'X_SICURA' | 'X_BILANCIATA' | 'X_RISCHIOSA';
  label: string;
  description: string;
  bets: XBet[];
  combinedDrawProb: number;
}

export async function POST() {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3005';

    // Fetch both standard and X schedine in parallel
    const [betsRes, xRes] = await Promise.all([
      fetch(`${baseUrl}/api/predictions/suggested-bets`).catch(() => null),
      fetch(`${baseUrl}/api/predictions/schedina-x`).catch(() => null),
    ]);

    let savedCount = 0;
    let skippedCount = 0;

    // Process standard schedine
    if (betsRes?.ok) {
      const data = await betsRes.json();
      const schedine: Schedina[] = data.schedine || [];

      for (const schedina of schedine) {
        const targetDate = schedina.date; // Already YYYY-MM-DD

        // Check if already saved
        const existing = await db
          .select({ id: savedSchedine.id })
          .from(savedSchedine)
          .where(
            and(
              eq(savedSchedine.type, schedina.type),
              eq(savedSchedine.targetDate, targetDate)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          skippedCount++;
          continue;
        }

        await db.insert(savedSchedine).values({
          type: schedina.type,
          label: schedina.label,
          targetDate,
          bets: schedina.bets,
          combinedProbability: schedina.combinedProbability.toFixed(2),
          totalBets: schedina.bets.length,
          pendingBets: schedina.bets.length,
          correctBets: 0,
          wrongBets: 0,
        });
        savedCount++;
      }
    }

    // Process X schedine
    if (xRes?.ok) {
      const xData = await xRes.json();
      const schedineX: SchedinaX[] = xData.schedineX || [];

      for (const sx of schedineX) {
        // Extract target date from first bet's matchDate
        if (sx.bets.length === 0) continue;
        const targetDate = new Date(sx.bets[0].matchDate).toISOString().split('T')[0];

        // Check if already saved
        const existing = await db
          .select({ id: savedSchedine.id })
          .from(savedSchedine)
          .where(
            and(
              eq(savedSchedine.type, sx.tier),
              eq(savedSchedine.targetDate, targetDate)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          skippedCount++;
          continue;
        }

        // Normalize X bets to include betType field for consistency
        const normalizedBets = sx.bets.map(bet => ({
          ...bet,
          betType: 'X' as const,
          betLabel: 'Pareggio (X)',
        }));

        await db.insert(savedSchedine).values({
          type: sx.tier,
          label: sx.label,
          targetDate,
          bets: normalizedBets,
          combinedProbability: sx.combinedDrawProb.toFixed(2),
          totalBets: sx.bets.length,
          pendingBets: sx.bets.length,
          correctBets: 0,
          wrongBets: 0,
        });
        savedCount++;
      }
    }

    return NextResponse.json({
      saved: savedCount,
      skipped: skippedCount,
      message: `Saved ${savedCount} schedine, skipped ${skippedCount} (already exist)`,
    });
  } catch (error) {
    console.error('Error saving schedine:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to save schedine' } },
      { status: 500 }
    );
  }
}
