'use client';

import { useEffect, useState } from 'react';

interface StreakData {
  teamId: number;
  teamName: string;
  winStreak: number;
  drawStreak: number;
  lossStreak: number;
  over25Rate: number;
  bttsRate: number;
  cleanSheetRate: number;
  scoringRate: number;
  matchesAnalyzed: number;
}

export function TeamStreakBadges({ teamId }: { teamId: number }) {
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/teams/streaks?teamId=${teamId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.streak) {
            setStreak(data.streak);
          }
        }
      } catch {
        // Silently fail — badges are supplementary
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [teamId]);

  if (loading || !streak || streak.matchesAnalyzed < 3) return null;

  const badges: Array<{ label: string; color: string; bg: string }> = [];

  if (streak.winStreak >= 2) {
    badges.push({
      label: `${streak.winStreak}V`,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/15',
    });
  }

  if (streak.drawStreak >= 2) {
    badges.push({
      label: `${streak.drawStreak}P`,
      color: 'text-amber-400',
      bg: 'bg-amber-500/15',
    });
  }

  if (streak.lossStreak >= 2) {
    badges.push({
      label: `${streak.lossStreak}S`,
      color: 'text-red-400',
      bg: 'bg-red-500/15',
    });
  }

  if (streak.over25Rate >= 60) {
    const count = Math.round(streak.over25Rate / 100 * streak.matchesAnalyzed);
    badges.push({
      label: `O2.5: ${count}/${streak.matchesAnalyzed}`,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/15',
    });
  }

  if (streak.bttsRate >= 60) {
    const count = Math.round(streak.bttsRate / 100 * streak.matchesAnalyzed);
    badges.push({
      label: `GG: ${count}/${streak.matchesAnalyzed}`,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/15',
    });
  }

  if (streak.cleanSheetRate >= 40) {
    const count = Math.round(streak.cleanSheetRate / 100 * streak.matchesAnalyzed);
    badges.push({
      label: `CS: ${count}/${streak.matchesAnalyzed}`,
      color: 'text-blue-400',
      bg: 'bg-blue-500/15',
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 justify-center mt-1.5">
      {badges.map((badge, i) => (
        <span
          key={i}
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${badge.bg} ${badge.color}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}
