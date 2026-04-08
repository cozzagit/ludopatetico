import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatProbability(prob: string | number | null): number {
  if (prob === null || prob === undefined) return 0;
  return parseFloat(String(prob));
}

export function getMatchResult(homeScore: number, awayScore: number): 'HOME_TEAM' | 'DRAW' | 'AWAY_TEAM' {
  if (homeScore > awayScore) return 'HOME_TEAM';
  if (homeScore < awayScore) return 'AWAY_TEAM';
  return 'DRAW';
}

export function getCurrentSeason(): number {
  const now = new Date();
  return now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear();
}
