import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, predictions } from '@/src/lib/db/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { auth } from '@/src/lib/auth';
import { aiPredictionService } from '@/src/lib/services/ai-prediction';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Non autenticato' } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const onlyToday = searchParams.get('onlyToday') === 'true';
    console.log(`Starting prediction regeneration... ${onlyToday ? '(only today)' : '(all upcoming)'}`);

    const now = new Date();
    let allMatches;

    if (onlyToday) {
      // Get only today's matches
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

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

      allMatches = upcomingMatches.filter((m) => {
        const matchDate = new Date(m.utcDate);
        return matchDate >= today && matchDate < tomorrow;
      });
    } else {
      const futureDate = new Date();
      futureDate.setDate(now.getDate() + 30);

      allMatches = await db
        .select()
        .from(matches)
        .where(
          and(
            gte(matches.utcDate, now),
            sql`${matches.utcDate} <= ${futureDate.toISOString()}`
          )
        )
        .orderBy(matches.utcDate);
    }

    console.log(`Found ${allMatches.length} ${onlyToday ? "today's" : 'upcoming'} matches`);

    let regenerated = 0;
    let failed = 0;

    for (const match of allMatches) {
      try {
        // NEVER delete predictions for finished matches (needed for learning)
        if (match.status !== 'FINISHED') {
          const existing = await db
            .select()
            .from(predictions)
            .where(eq(predictions.matchId, match.id))
            .orderBy(desc(predictions.createdAt))
            .limit(1)
            .then((r) => r[0] ?? null);

          if (existing) {
            await db.delete(predictions).where(eq(predictions.matchId, match.id));
          }

          // Generate new prediction
          await aiPredictionService.generatePredictionFromMatchId(match.id, true);
          regenerated++;
          console.log(`Regenerated prediction for match ${match.id}`);
        }
      } catch (error) {
        failed++;
        console.error(`Failed to regenerate prediction for match ${match.id}:`, error);
      }
    }

    return NextResponse.json({
      message: 'Prediction regeneration completed',
      regenerated,
      failed,
      total: allMatches.length,
    });
  } catch (error) {
    console.error('Error regenerating predictions:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to regenerate predictions' } },
      { status: 500 }
    );
  }
}
