import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, predictions, competitions, teams, predictionPerformance } from '@/src/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { auth } from '@/src/lib/auth';
import { footballDataService } from '@/src/lib/services/football-data';
import { apiFootballService } from '@/src/lib/services/api-football';
import { learningSystem } from '@/src/lib/services/learning-system';
import { API_FOOTBALL_LEAGUES, COMP_CODE_MAP } from '@/src/lib/constants';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user || !(session.user as any).isAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    console.log('Verifying predictions that need results...');

    // === STEP 0: Find SCHEDULED matches that should be finished (2+ hours after start) ===
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const scheduledMatchesToSync = await db
      .select({ match: matches })
      .from(matches)
      .innerJoin(predictions, eq(predictions.matchId, matches.id))
      .where(
        and(
          sql`${matches.status} IN ('TIMED', 'SCHEDULED')`,
          sql`${matches.utcDate} < ${twoHoursAgo.toISOString()}`
        )
      )
      .orderBy(desc(matches.utcDate))
      .then((r) => r.map((row) => row.match));

    console.log(`Found ${scheduledMatchesToSync.length} SCHEDULED matches that should be finished`);

    // === STEP 1: Find matches with predictions but without accuracy ===
    const finishedMatches = await db
      .select({ match: matches })
      .from(matches)
      .innerJoin(predictions, eq(predictions.matchId, matches.id))
      .where(
        and(
          eq(matches.status, 'FINISHED'),
          sql`${predictions.result1x2Correct} IS NULL`
        )
      )
      .orderBy(desc(matches.utcDate))
      .then((r) => r.map((row) => row.match));

    console.log(`Found ${finishedMatches.length} FINISHED matches needing accuracy verification`);

    // Combine both sets of matches by competition
    const matchesByCompetition = new Map<number, Array<{ id: number; competitionId: number }>>();

    for (const match of scheduledMatchesToSync) {
      if (!matchesByCompetition.has(match.competitionId)) {
        matchesByCompetition.set(match.competitionId, []);
      }
      matchesByCompetition.get(match.competitionId)!.push(match);
    }

    for (const match of finishedMatches) {
      if (!matchesByCompetition.has(match.competitionId)) {
        matchesByCompetition.set(match.competitionId, []);
      }
      const existing = matchesByCompetition.get(match.competitionId)!;
      if (!existing.some((m) => m.id === match.id)) {
        existing.push(match);
      }
    }

    if (matchesByCompetition.size === 0) {
      return NextResponse.json({
        message: 'Nessun pronostico da verificare',
        synced: 0,
        total: 0,
        accuracyProcessed: 0,
        stats: { totalFinished: 0, withAccuracy: 0, pendingAccuracy: 0, accuracy1x2: 0 },
      });
    }

    console.log(`Updating ${matchesByCompetition.size} competitions...`);

    // === STEP 2: Sync only the competitions with pending predictions ===
    let competitionsSynced = 0;

    for (const [compId, compMatches] of Array.from(matchesByCompetition.entries())) {
      try {
        const competition = await db
          .select()
          .from(competitions)
          .where(eq(competitions.id, compId))
          .limit(1)
          .then((r) => r[0] ?? null);
        const compName = competition?.name || `Competition ${compId}`;

        console.log(`  Syncing ${compName} (${compMatches.length} predictions to verify)...`);

        const compCode = COMP_CODE_MAP[compId];

        if (compCode) {
          // Football-Data competitions
          await footballDataService.syncFinishedMatches(compCode, 14);
          competitionsSynced++;
        } else if (compId === 136) {
          // Serie B via API-Football
          const twoWeeksAgoDate = new Date();
          twoWeeksAgoDate.setDate(twoWeeksAgoDate.getDate() - 14);
          const todayDate = new Date();

          const { matches: serieBMatches, teams: serieBTeams } = await apiFootballService.getFixtures(
            API_FOOTBALL_LEAGUES.SERIE_B,
            twoWeeksAgoDate.toISOString().split('T')[0],
            todayDate.toISOString().split('T')[0],
            2025
          );

          for (const team of serieBTeams) {
            await db.insert(teams).values(team).onConflictDoUpdate({
              target: teams.id,
              set: { name: team.name, shortName: team.shortName, tla: team.tla, crest: team.crest },
            });
          }
          for (const match of serieBMatches) {
            await db.insert(matches).values(match).onConflictDoUpdate({
              target: matches.id,
              set: { ...match, lastUpdated: new Date() },
            });
          }
          competitionsSynced++;
        } else if (compId === 32) {
          // WC Qualifiers Europe via API-Football
          const twoWeeksAgoDate = new Date();
          twoWeeksAgoDate.setDate(twoWeeksAgoDate.getDate() - 14);
          const todayDate = new Date();

          const { matches: wcqMatches, teams: wcqTeams } = await apiFootballService.getFixtures(
            API_FOOTBALL_LEAGUES.WC_QUALIFICATION_EUROPE,
            twoWeeksAgoDate.toISOString().split('T')[0],
            todayDate.toISOString().split('T')[0],
            2024
          );

          for (const team of wcqTeams) {
            await db.insert(teams).values(team).onConflictDoUpdate({
              target: teams.id,
              set: { name: team.name, shortName: team.shortName, tla: team.tla, crest: team.crest },
            });
          }
          for (const match of wcqMatches) {
            await db.insert(matches).values(match).onConflictDoUpdate({
              target: matches.id,
              set: { ...match, lastUpdated: new Date() },
            });
          }
          competitionsSynced++;
        }

        console.log(`  ${compName} synced`);
      } catch (error) {
        console.error(`  Error syncing competition ${compId}:`, error);
      }
    }

    // === STEP 3: Calculate accuracy for the predictions ===
    console.log('Calculating accuracy for verified predictions...');

    // Re-fetch finished matches to get updated scores
    const matchesToProcess = await db
      .select({ match: matches })
      .from(matches)
      .innerJoin(predictions, eq(predictions.matchId, matches.id))
      .where(
        and(
          eq(matches.status, 'FINISHED'),
          sql`${predictions.result1x2Correct} IS NULL`
        )
      )
      .orderBy(desc(matches.utcDate))
      .then((r) => r.map((row) => row.match));

    let accuracyProcessed = 0;
    for (const match of matchesToProcess) {
      try {
        if (match.homeScore === null || match.awayScore === null) continue;

        await footballDataService.updatePredictionAccuracy(
          match.id,
          match.homeScore,
          match.awayScore,
          match.winner ?? null,
          match.homeScoreHT ?? null,
          match.awayScoreHT ?? null
        );

        const prediction = await db
          .select()
          .from(predictions)
          .where(eq(predictions.matchId, match.id))
          .orderBy(desc(predictions.createdAt))
          .limit(1)
          .then((r) => r[0] ?? null);

        if (prediction && (prediction.result1x2Correct !== null || prediction.resultOver25Correct !== null)) {
          await learningSystem.updateFromResult(prediction, match);
        }

        accuracyProcessed++;
      } catch (error) {
        console.error(`Error processing match ${match.id}:`, error);
      }
    }

    // Get stats after processing
    const statsAfterResult = await db
      .select({
        totalFinished: sql<number>`COUNT(DISTINCT ${matches.id})`,
        withAccuracy: sql<number>`COUNT(DISTINCT CASE WHEN ${predictions.result1x2Correct} IS NOT NULL THEN ${matches.id} END)`,
        pendingAccuracy: sql<number>`COUNT(DISTINCT CASE WHEN ${predictions.id} IS NOT NULL AND ${predictions.result1x2Correct} IS NULL THEN ${matches.id} END)`,
      })
      .from(matches)
      .leftJoin(predictions, eq(predictions.matchId, matches.id))
      .where(eq(matches.status, 'FINISHED'));

    const statsAfter = statsAfterResult[0] || { totalFinished: 0, withAccuracy: 0, pendingAccuracy: 0 };

    // Get prediction accuracy stats
    const allPredictions = await db
      .select()
      .from(predictions)
      .where(sql`${predictions.actualResult} IS NOT NULL`);
    const result1x2List = allPredictions.filter((p) => p.result1x2Correct !== null);
    const result1x2Correct = result1x2List.filter((p) => p.result1x2Correct === true).length;
    const accuracy1x2 = result1x2List.length > 0 ? Math.round((result1x2Correct / result1x2List.length) * 100) : 0;

    console.log(`Verification complete: ${competitionsSynced} competitions updated, ${accuracyProcessed} predictions verified`);

    return NextResponse.json({
      message: `${competitionsSynced} competizioni aggiornate, ${accuracyProcessed} pronostici verificati`,
      synced: competitionsSynced,
      total: matchesByCompetition.size,
      accuracyProcessed,
      stats: {
        totalFinished: statsAfter.totalFinished,
        withAccuracy: statsAfter.withAccuracy,
        pendingAccuracy: statsAfter.pendingAccuracy,
        accuracy1x2,
      },
    });
  } catch (error) {
    console.error('Error in prediction verification:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to verify predictions', details: error instanceof Error ? error.message : 'Unknown error' } },
      { status: 500 }
    );
  }
}
