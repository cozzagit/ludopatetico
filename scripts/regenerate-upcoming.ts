/**
 * Regenerate predictions for all upcoming matches (next 7 days).
 * Run directly on VPS: npx tsx scripts/regenerate-upcoming.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually (no dotenv dependency)
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
} catch {
  console.log('⚠️  No .env.local found, using existing env vars');
}
import { db } from '../src/lib/db';
import { matches, predictions } from '../src/lib/db/schema';
import { and, gte, desc, eq, sql } from 'drizzle-orm';
import { aiPredictionService } from '../src/lib/services/ai-prediction';

async function main() {
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

      const matchDate = new Date(match.utcDate).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      console.log(`✅ [${regenerated}/${upcomingMatches.length}] ${match.homeTeamName} vs ${match.awayTeamName} (${match.competitionId}) — ${matchDate}`);

      // Rate limit: wait between API calls
      await new Promise(resolve => setTimeout(resolve, 3000));
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
