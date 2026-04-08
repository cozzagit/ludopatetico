import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { predictions } from '@/src/lib/db/schema';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    const all = await db
      .select()
      .from(predictions)
      .where(sql`${predictions.actualResult} IS NOT NULL`);

    const total = all.length;

    // Calculate "at least one correct"
    const atLeastOneCorrectCount = all.filter((p) => {
      return (
        p.result1x2Correct === true ||
        p.resultOver25Correct === true ||
        p.resultOver35Correct === true ||
        p.resultBttsCorrect === true
      );
    }).length;

    const result1x2 = all.filter((p) => p.result1x2Correct !== null);
    const result1x2Correct = result1x2.filter((p) => p.result1x2Correct === true).length;

    const resultOver25 = all.filter((p) => p.resultOver25Correct !== null);
    const resultOver25Correct = resultOver25.filter((p) => p.resultOver25Correct === true).length;

    const resultOver35 = all.filter((p) => p.resultOver35Correct !== null);
    const resultOver35Correct = resultOver35.filter((p) => p.resultOver35Correct === true).length;

    const resultBtts = all.filter((p) => p.resultBttsCorrect !== null);
    const resultBttsCorrect = resultBtts.filter((p) => p.resultBttsCorrect === true).length;

    // Cards and Corners stats
    const resultCardsOver25 = all.filter((p) => p.resultCardsOver25Correct !== null);
    const resultCardsOver25Correct = resultCardsOver25.filter((p) => p.resultCardsOver25Correct === true).length;

    const resultCardsOver45 = all.filter((p) => p.resultCardsOver45Correct !== null);
    const resultCardsOver45Correct = resultCardsOver45.filter((p) => p.resultCardsOver45Correct === true).length;

    const resultCornersOver85 = all.filter((p) => p.resultCornersOver85Correct !== null);
    const resultCornersOver85Correct = resultCornersOver85.filter((p) => p.resultCornersOver85Correct === true).length;

    const resultCornersOver105 = all.filter((p) => p.resultCornersOver105Correct !== null);
    const resultCornersOver105Correct = resultCornersOver105.filter((p) => p.resultCornersOver105Correct === true).length;

    const stats: any = {
      total,
      atLeastOneCorrect: {
        correct: atLeastOneCorrectCount,
        total,
        percentage: total > 0 ? Math.round((atLeastOneCorrectCount / total) * 100) : 0,
      },
      result1x2: {
        correct: result1x2Correct,
        total: result1x2.length,
        percentage: result1x2.length > 0 ? Math.round((result1x2Correct / result1x2.length) * 100) : 0,
      },
      resultOver25: {
        correct: resultOver25Correct,
        total: resultOver25.length,
        percentage: resultOver25.length > 0 ? Math.round((resultOver25Correct / resultOver25.length) * 100) : 0,
      },
      resultOver35: {
        correct: resultOver35Correct,
        total: resultOver35.length,
        percentage: resultOver35.length > 0 ? Math.round((resultOver35Correct / resultOver35.length) * 100) : 0,
      },
      resultBtts: {
        correct: resultBttsCorrect,
        total: resultBtts.length,
        percentage: resultBtts.length > 0 ? Math.round((resultBttsCorrect / resultBtts.length) * 100) : 0,
      },
    };

    if (resultCardsOver25.length > 0) {
      stats.resultCardsOver25 = {
        correct: resultCardsOver25Correct,
        total: resultCardsOver25.length,
        percentage: Math.round((resultCardsOver25Correct / resultCardsOver25.length) * 100),
      };
    }
    if (resultCardsOver45.length > 0) {
      stats.resultCardsOver45 = {
        correct: resultCardsOver45Correct,
        total: resultCardsOver45.length,
        percentage: Math.round((resultCardsOver45Correct / resultCardsOver45.length) * 100),
      };
    }
    if (resultCornersOver85.length > 0) {
      stats.resultCornersOver85 = {
        correct: resultCornersOver85Correct,
        total: resultCornersOver85.length,
        percentage: Math.round((resultCornersOver85Correct / resultCornersOver85.length) * 100),
      };
    }
    if (resultCornersOver105.length > 0) {
      stats.resultCornersOver105 = {
        correct: resultCornersOver105Correct,
        total: resultCornersOver105.length,
        percentage: Math.round((resultCornersOver105Correct / resultCornersOver105.length) * 100),
      };
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching prediction stats:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch prediction statistics' } },
      { status: 500 }
    );
  }
}
