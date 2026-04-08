import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local
const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx);
      const val = trimmed.substring(eqIdx + 1);
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

import { footballDataService } from '../src/lib/services/football-data';
import { syncMarketOdds } from '../src/lib/services/polymarket';

async function main() {
  console.log('=== FOOTBALL ORACLE - FULL SYNC ===');
  console.log('Started:', new Date().toISOString());

  // 1. Sync Football-Data.org competitions
  const fdComps = ['SA', 'PL', 'BL1', 'FL1', 'PD', 'CL'];
  for (const code of fdComps) {
    try {
      console.log(`\n[Football-Data] Syncing ${code}...`);
      await footballDataService.syncCompetitionData(code);
      console.log(`[Football-Data] ${code} done`);
    } catch (e: any) {
      console.error(`[Football-Data] ${code} error:`, e.message);
    }
  }

  // 2. Sync standings for leagues
  const leagueCodes = ['SA', 'PL', 'BL1', 'FL1', 'PD'];
  const compIds: Record<string, number> = { SA: 2019, PL: 2021, BL1: 2002, FL1: 2015, PD: 2014 };
  for (const code of leagueCodes) {
    try {
      console.log(`\n[Standings] Syncing ${code}...`);
      await footballDataService.syncStandings(code, compIds[code]);
      console.log(`[Standings] ${code} done`);
    } catch (e: any) {
      console.error(`[Standings] ${code} error:`, e.message);
    }
  }

  // 3. Sync Polymarket odds
  try {
    console.log('\n[Polymarket] Syncing blockchain market odds...');
    const results = await syncMarketOdds();
    for (const r of results) {
      if (r.eventsFound > 0 || r.errors.length > 0) {
        console.log(`[Polymarket] ${r.competition}: ${r.eventsFound} events, ${r.matchesMatched} matched, ${r.oddsUpserted} upserted${r.errors.length > 0 ? ' ERRORS: ' + r.errors.join(', ') : ''}`);
      }
    }
    const totalMatched = results.reduce((s, r) => s + r.matchesMatched, 0);
    console.log(`[Polymarket] Total: ${totalMatched} matches with market odds`);
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
