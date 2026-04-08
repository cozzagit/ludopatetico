import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local BEFORE any other imports
const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
for (const line of envContent.split('\n')) {
  const t = line.trim();
  if (t && !t.startsWith('#')) {
    const i = t.indexOf('=');
    if (i > 0) process.env[t.substring(0, i)] = t.substring(i + 1);
  }
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const { footballDataService } = await import('../src/lib/services/football-data');
  const { syncMarketOdds } = await import('../src/lib/services/polymarket');
  const { db } = await import('../src/lib/db');
  const { matches } = await import('../src/lib/db/schema');
  const { eq, and, lt, inArray } = await import('drizzle-orm');

  console.log('=== SYNC RESULTS + STANDINGS + POLYMARKET ===');
  console.log('Started:', new Date().toISOString());

  const DELAY_MS = 65000; // 65s between API calls to respect rate limit
  const DAYS_BACK = 20; // Cover all missing days since March 20

  // 1. Sync finished matches (results) for each competition
  const comps = ['SA', 'PL', 'BL1', 'FL1', 'PD', 'CL'];
  for (const code of comps) {
    try {
      console.log(`\n[Results] Syncing ${code} (last ${DAYS_BACK} days)...`);
      const data = await footballDataService.getFinishedMatches(code, DAYS_BACK);
      let updated = 0;
      for (const match of data.matches) {
        if (!match.homeTeam?.id || !match.awayTeam?.id) continue;
        const { homeTeam: _ht, awayTeam: _at, ...matchData } = match;
        await db.insert(matches).values({
          ...matchData,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
        }).onConflictDoUpdate({
          target: matches.id,
          set: {
            status: matchData.status,
            homeScore: matchData.homeScore,
            awayScore: matchData.awayScore,
            homeScoreHT: matchData.homeScoreHT,
            awayScoreHT: matchData.awayScoreHT,
            winner: matchData.winner,
            lastUpdated: new Date(),
          },
        });
        updated++;
      }
      console.log(`[Results] ${code}: ${updated} matches updated`);
    } catch (e: any) {
      console.error(`[Results] ${code} error:`, e.message);
    }
    console.log(`Waiting ${DELAY_MS / 1000}s for rate limit...`);
    await delay(DELAY_MS);
  }

  // 2. Sync upcoming matches (next 30 days)
  for (const code of comps) {
    try {
      console.log(`\n[Upcoming] Syncing ${code}...`);
      await footballDataService.syncCompetitionData(code);
      console.log(`[Upcoming] ${code} done`);
    } catch (e: any) {
      console.error(`[Upcoming] ${code} error:`, e.message);
    }
    await delay(DELAY_MS);
  }

  // 3. Sync standings
  const standings: Record<string, number> = { SA: 2019, PL: 2021, BL1: 2002, FL1: 2015, PD: 2014 };
  for (const [code, id] of Object.entries(standings)) {
    try {
      console.log(`\n[Standings] Syncing ${code}...`);
      await footballDataService.syncStandings(code, id);
      console.log(`[Standings] ${code} done`);
    } catch (e: any) {
      console.error(`[Standings] ${code} error:`, e.message);
    }
    await delay(DELAY_MS);
  }

  // 4. Polymarket odds (no rate limit issues)
  try {
    console.log('\n[Polymarket] Syncing blockchain market odds...');
    const results = await syncMarketOdds();
    const total = results.reduce((s, r) => s + r.matchesMatched, 0);
    for (const r of results) {
      if (r.matchesMatched > 0) {
        console.log(`[Polymarket] ${r.competition}: ${r.matchesMatched} matched`);
      }
    }
    console.log(`[Polymarket] Total: ${total} matches with market odds`);
  } catch (e: any) {
    console.error('[Polymarket] Error:', e.message);
  }

  console.log('\n=== SYNC COMPLETE ===');
  console.log('Finished:', new Date().toISOString());
  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
