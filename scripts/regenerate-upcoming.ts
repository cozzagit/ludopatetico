/**
 * Regenerate predictions for all upcoming matches (next 7 days).
 * Run directly on VPS: npx tsx scripts/regenerate-upcoming.ts
 *
 * IMPORTANT: .env.local must be loaded BEFORE any module that reads env vars.
 * We use dynamic imports to ensure correct ordering.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Step 1: Load .env.local BEFORE anything else
const envPath = resolve(process.cwd(), '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      process.env[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
    }
  }
  console.log('✅ .env.local loaded');
  console.log('   OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ present' : '❌ missing');
  console.log('   DATABASE_URL:', process.env.DATABASE_URL ? '✅ present' : '❌ missing');
} catch {
  console.log('⚠️  No .env.local found, using existing env vars');
}

// Step 2: Dynamic imports AFTER env is loaded
async function main() {
  const { db } = await import('../src/lib/db');
  const { matches, predictions } = await import('../src/lib/db/schema');
  const { and, gte, eq, sql } = await import('drizzle-orm');
  const { aiPredictionService } = await import('../src/lib/services/ai-prediction');

  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(now.getDate() + 7);

  console.log(`\n🔄 Regenerating predictions for upcoming matches...`);
  console.log(`   From: ${now.toISOString()}`);
  console.log(`   To:   ${futureDate.toISOString()}\n`);

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

  console.log(`Found ${upcomingMatches.length} upcoming matches\n`);

  let regenerated = 0;
  let failed = 0;
  let skipped = 0;

  for (const match of upcomingMatches) {
    try {
      if (match.status === 'FINISHED') {
        skipped++;
        continue;
      }

      // Delete existing prediction
      const existing = await db
        .select()
        .from(predictions)
        .where(eq(predictions.matchId, match.id))
        .limit(1)
        .then((r) => r[0] ?? null);

      if (existing) {
        await db.delete(predictions).where(eq(predictions.matchId, match.id));
      }

      // Generate new prediction with improved prompt
      await aiPredictionService.generatePredictionFromMatchId(match.id, true);
      regenerated++;

      const matchDate = new Date(match.utcDate).toLocaleDateString('it-IT', {
        weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      console.log(`✅ [${regenerated}/${upcomingMatches.length}] ${match.homeTeamName} vs ${match.awayTeamName} (${match.competitionId}) — ${matchDate}`);

      // Rate limit: wait between API calls
      await new Promise(resolve => setTimeout(resolve, 3500));
    } catch (error) {
      failed++;
      console.error(`❌ Failed: ${match.homeTeamName} vs ${match.awayTeamName}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`\n📊 Results:`);
  console.log(`   Regenerated: ${regenerated}`);
  console.log(`   Failed:      ${failed}`);
  console.log(`   Skipped:     ${skipped}`);
  console.log(`   Total:       ${upcomingMatches.length}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
