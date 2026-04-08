import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, predictions } from '@/src/lib/db/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { auth } from '@/src/lib/auth';
import { aiPredictionService } from '@/src/lib/services/ai-prediction';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Non autenticato' } },
        { status: 401 }
      );
    }

    console.log('Generating daily predictions (today + next 2 days)...');

    // Get matches for today + next 2 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 3); // Today + 2 days = 3 days total

    // Get upcoming matches within 7 days, then filter
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + 7);

    const upcomingMatches = await db
      .select()
      .from(matches)
      .where(
        and(
          gte(matches.utcDate, now),
          sql`${matches.utcDate} <= ${futureDate.toISOString()}`
        )
      )
      .orderBy(matches.utcDate);

    const dailyMatches = upcomingMatches.filter((m) => {
      const matchDate = new Date(m.utcDate);
      return matchDate >= today && matchDate < endDate;
    });

    console.log(`Found ${dailyMatches.length} matches for today + next 2 days`);

    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (const match of dailyMatches) {
      try {
        // Check if prediction already exists
        const existing = await db
          .select()
          .from(predictions)
          .where(eq(predictions.matchId, match.id))
          .orderBy(desc(predictions.createdAt))
          .limit(1)
          .then((r) => r[0] ?? null);

        if (existing) {
          skipped++;
          console.log(`Skipped match ${match.id} (prediction exists)`);
          continue;
        }

        // Generate new prediction
        await aiPredictionService.generatePredictionFromMatchId(match.id, true);
        generated++;
        console.log(`Generated prediction for match ${match.id}`);
      } catch (error) {
        failed++;
        console.error(`Failed to generate prediction for match ${match.id}:`, error);
      }
    }

    return NextResponse.json({
      message: 'Daily predictions generated successfully',
      generated,
      skipped,
      failed,
      total: dailyMatches.length,
    });
  } catch (error) {
    console.error('Error generating daily predictions:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate daily predictions' } },
      { status: 500 }
    );
  }
}
