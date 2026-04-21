export const COMPETITIONS = {
  SERIE_A: { id: 2019, name: 'Serie A', code: 'SA', provider: 'football-data' as const, hasStandings: true },
  PREMIER_LEAGUE: { id: 2021, name: 'Premier League', code: 'PL', provider: 'football-data' as const, hasStandings: true },
  BUNDESLIGA: { id: 2002, name: 'Bundesliga', code: 'BL1', provider: 'football-data' as const, hasStandings: true },
  LIGUE_1: { id: 2015, name: 'Ligue 1', code: 'FL1', provider: 'football-data' as const, hasStandings: true },
  LA_LIGA: { id: 2014, name: 'La Liga', code: 'PD', provider: 'football-data' as const, hasStandings: true },
  CHAMPIONS_LEAGUE: { id: 2001, name: 'Champions League', code: 'CL', provider: 'football-data' as const, hasStandings: false },
  SERIE_B: { id: 136, name: 'Serie B', code: 'SB', provider: 'api-football' as const, hasStandings: true, apiFootballLeagueId: 136 },
  EUROPA_LEAGUE: { id: 2, name: 'Europa League', code: 'EL', provider: 'api-football' as const, hasStandings: false, apiFootballLeagueId: 3 },
  CONFERENCE_LEAGUE: { id: 848, name: 'Conference League', code: 'ECL', provider: 'api-football' as const, hasStandings: false, apiFootballLeagueId: 848 },
  WC_QUALIFICATION_EUROPE: { id: 32, name: 'Qualificazioni Mondiali UEFA', code: 'WCQ_EU', provider: 'api-football' as const, hasStandings: false, apiFootballLeagueId: 32 },
} as const;

export const MONITORED_COMPETITION_IDS = [2019, 2021, 2002, 2015, 2014, 2001, 2, 848, 136, 32];

export const API_FOOTBALL_LEAGUES = {
  SERIE_A: 135,
  SERIE_B: 136,
  CHAMPIONS_LEAGUE: 2,
  EUROPA_LEAGUE: 3,
  CONFERENCE_LEAGUE: 848,
  PREMIER_LEAGUE: 39,
  LA_LIGA: 140,
  BUNDESLIGA: 78,
  LIGUE_1: 61,
  WC_QUALIFICATION_EUROPE: 32,
} as const;

export const NATIONAL_TEAM_COMPETITIONS = new Set<number>([API_FOOTBALL_LEAGUES.WC_QUALIFICATION_EUROPE]);
export const NATIONAL_TEAM_ID_OFFSET = 1000000;

export const LIGUE1_ID_MAP: Record<number, number> = {
  522: 10001, // OGC Nice (conflicts with Palermo in Serie B)
  511: 10002, // Toulouse FC (conflicts with Empoli in Serie B)
  512: 10003, // Stade Brestois 29 (conflicts with Frosinone in Serie B)
  525: 10004, // FC Lorient (conflicts with Pescara in Serie B)
};

// Teams from API-Football/ECL/EL whose IDs conflict with Football-Data teams
// These IDs must NOT overwrite existing team names during cup syncs
// API-Football uses different IDs than Football-Data for the same concepts
export const PROTECTED_TEAM_IDS = new Set([
  79,  // Sevilla FC (Football-Data PD) — API-Football 79 = Lille (use 20003 instead)
  80,  // RCD Espanyol (Football-Data PD) — API-Football 80 = Lyon (use 20004 instead)
  108, // FC Internazionale Milano (Football-Data) — API-Football 108 = Strasbourg (use 576 instead)
  397, // Brighton & Hove Albion FC (Football-Data PL) — API-Football 397 = Midtjylland (use 20002 instead)
  498, // Sporting CP (Football-Data CL) — API-Football 498 = Sampdoria (use 20001 instead)
  559, // La Liga team (Football-Data PD) — API-Football 559 = FCSB (use 20005 instead)
]);

// Cup team ID remapping: API-Football ID → our DB ID
// When syncing cups (EL/ECL) via API-Football, these IDs must be remapped
export const CUP_TEAM_ID_MAP: Record<number, number> = {
  95: 576,    // Strasbourg: API-Football ID 95 → our ID 576 (from Ligue 1)
  65: 351,    // Nottingham Forest: API-Football ID 65 → Football-Data ID 351
  66: 58,     // Aston Villa: API-Football ID 66 → Football-Data ID 58
  543: 90,    // Real Betis: API-Football ID 543 → Football-Data ID 90
  397: 20002, // Midtjylland (API-Football) → remap to avoid overwriting Brighton (Football-Data 397)
  79: 20003,  // Lille (API-Football) → remap to avoid overwriting Sevilla (Football-Data 79)
  80: 20004,  // Lyon (API-Football) → remap to avoid overwriting Espanyol (Football-Data 80)
  559: 20005, // FCSB (API-Football) → remap to avoid overwriting La Liga team (Football-Data 559)
};

export const SERIE_B_TEAMS: Record<number, { name: string; shortName: string; tla: string }> = {
  498: { name: 'Sampdoria', shortName: 'Sampdoria', tla: 'SAM' },
  511: { name: 'Empoli', shortName: 'Empoli', tla: 'EMP' },
  512: { name: 'Frosinone', shortName: 'Frosinone', tla: 'FRO' },
  522: { name: 'Palermo', shortName: 'Palermo', tla: 'PAL' },
  525: { name: 'Pescara', shortName: 'Pescara', tla: 'PES' },
};

// Serie B teams whose API-Football IDs conflict with Football-Data teams
// These get remapped to custom IDs (20001+) to avoid overwriting CL/EL teams
export const SERIE_B_ID_MAP: Record<number, number> = {
  498: 20001, // Sampdoria (conflicts with Sporting CP in CL)
};

export const COMP_CODE_MAP: Record<number, string> = {
  2019: 'SA', 2021: 'PL', 2002: 'BL1', 2015: 'FL1', 2014: 'PD',
  2001: 'CL', 2: 'EL', 848: 'ECL', 136: 'SB', 32: 'WCQ_EU',
};

export const LEAGUE_TO_COMP_MAP: Record<number, number> = {
  135: 2019, 136: 136, 39: 2021, 78: 2002, 61: 2015, 140: 2014,
  2: 2001, 3: 2, 848: 848, 32: 32,
};

// Polymarket Prediction Market Configuration
export const POLYMARKET_BASE_URL = 'https://gamma-api.polymarket.com';

// Tag IDs for filtering Polymarket events by competition
export const POLYMARKET_TAG_IDS: Record<string, number> = {
  SA: 101962,   // Serie A
  PL: 82,       // Premier League
  BL1: 1494,    // Bundesliga
  FL1: 102070,  // Ligue 1
  PD: 780,      // La Liga
  CL: 1234,     // Champions League
  EL: 101787,   // Europa League
  ECL: 100787,  // Conference League
  SB: 102870,   // Serie B
  SOCCER: 100350, // All soccer
};

// Polymarket sport codes (from /sports endpoint)
export const POLYMARKET_SPORT_CODES: Record<string, string> = {
  SA: 'sea',
  PL: 'epl',
  BL1: 'bun',
  FL1: 'fl1',
  PD: 'lal',
  CL: 'ucl',
  EL: 'uel',
  ECL: 'con',
  SB: 'itsb',
};

// Polymarket market types we care about
export const POLYMARKET_MARKET_TYPES = [
  'moneyline',           // 1X2
  'totals',              // Over/Under goals
  'both_teams_to_score', // BTTS
  'spreads',             // Asian Handicap
  'double_chance',       // Double Chance
  'first_half_moneyline',// HT 1X2
  'first_half_totals',   // HT Over/Under
  'total_corners',       // Corners
  'soccer_halftime_result', // HT result
] as const;

export const PREMIUM_PLANS = {
  monthly: { amount: 9.90, days: 30, label: 'mensile' },
  yearly: { amount: 99.00, days: 365, label: 'annuale' },
} as const;

export const MARKET_TYPES = [
  '1X2', 'OVER_25', 'OVER_35', 'BTTS',
  '1X2_HT', 'OVER_05_HT', 'OVER_15_HT', 'BTTS_HT',
  'TOTAL_CARDS_OVER25', 'TOTAL_CARDS_OVER45',
  'TOTAL_CORNERS_OVER85', 'TOTAL_CORNERS_OVER105',
] as const;

export const TARGET_ACCURACIES: Record<string, number> = {
  '1X2': 45, 'OVER_25': 55, 'OVER_35': 60, 'BTTS': 55,
  '1X2_HT': 40, 'OVER_05_HT': 70, 'OVER_15_HT': 55, 'BTTS_HT': 60,
  'TOTAL_CARDS_OVER25': 55, 'TOTAL_CARDS_OVER45': 55,
  'TOTAL_CORNERS_OVER85': 55, 'TOTAL_CORNERS_OVER105': 55,
};
