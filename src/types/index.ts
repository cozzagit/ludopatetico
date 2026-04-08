import type { Competition, Team, Match, Prediction, MatchStats, TeamForm, Standing, Injury } from '@/src/lib/db/schema';

export type EnrichedMatch = Match & {
  homeTeam: Team | null;
  awayTeam: Team | null;
  competition: Competition | null;
  prediction?: Prediction | null;
};

export type EnrichedPrediction = Prediction & {
  match: EnrichedMatch;
};

export type PredictionStats = {
  result1x2: { correct: number; total: number; percentage: number };
  over25: { correct: number; total: number; percentage: number };
  over35: { correct: number; total: number; percentage: number };
  btts: { correct: number; total: number; percentage: number };
};

export type ApiResponse<T> = {
  data: T;
  meta?: { requestId?: string };
};

export type ApiError = {
  error: { code: string; message: string; details?: unknown[] };
};

export type { Competition, Team, Match, Prediction, MatchStats, TeamForm, Standing, Injury };
