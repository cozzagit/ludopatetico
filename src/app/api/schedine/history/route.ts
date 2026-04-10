import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { savedSchedine } from '@/src/lib/db/schema';
import { desc, eq, gte, and } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);
    const typeFilter = searchParams.get('type') || null;

    // Calculate the cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    // Build query conditions
    const conditions = [gte(savedSchedine.targetDate, cutoffStr)];
    if (typeFilter) {
      conditions.push(eq(savedSchedine.type, typeFilter));
    }

    const results = await db
      .select()
      .from(savedSchedine)
      .where(and(...conditions))
      .orderBy(desc(savedSchedine.targetDate), desc(savedSchedine.generatedAt))
      .limit(100);

    // Compute aggregate stats
    const total = results.length;
    const checked = results.filter(r => r.checkedAt !== null && r.pendingBets === 0);
    const wins = checked.filter(r => r.isWin === true).length;
    const losses = checked.filter(r => r.isWin === false).length;
    const pending = results.filter(r => r.checkedAt === null || (r.pendingBets !== null && r.pendingBets > 0)).length;
    const winRate = checked.length > 0 ? (wins / checked.length) * 100 : 0;

    // Calculate current streak
    let streak = 0;
    let streakType: 'win' | 'loss' | 'none' = 'none';
    for (const r of checked.sort((a, b) => b.targetDate.localeCompare(a.targetDate))) {
      if (streakType === 'none') {
        streakType = r.isWin ? 'win' : 'loss';
        streak = 1;
      } else if ((streakType === 'win' && r.isWin) || (streakType === 'loss' && !r.isWin)) {
        streak++;
      } else {
        break;
      }
    }

    // Per-type stats
    const typeStats: Record<string, { total: number; wins: number; losses: number; pending: number; winRate: number }> = {};
    for (const r of results) {
      if (!typeStats[r.type]) {
        typeStats[r.type] = { total: 0, wins: 0, losses: 0, pending: 0, winRate: 0 };
      }
      typeStats[r.type].total++;
      if (r.checkedAt && r.pendingBets === 0) {
        if (r.isWin) typeStats[r.type].wins++;
        else typeStats[r.type].losses++;
      } else {
        typeStats[r.type].pending++;
      }
    }
    for (const ts of Object.values(typeStats)) {
      const resolved = ts.wins + ts.losses;
      ts.winRate = resolved > 0 ? (ts.wins / resolved) * 100 : 0;
    }

    return NextResponse.json({
      schedine: results,
      stats: {
        total,
        wins,
        losses,
        pending,
        winRate: Math.round(winRate * 10) / 10,
        streak,
        streakType,
        typeStats,
      },
    });
  } catch (error) {
    console.error('Error fetching schedine history:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch history' } },
      { status: 500 }
    );
  }
}
