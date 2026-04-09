'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Loader2, BarChart3, Target, Activity, Trophy, Percent, Hash } from 'lucide-react';

interface PivotCell {
  accuracy: number;
  total: number;
  correct: number;
}

interface StatsData {
  total: number;
  [key: string]: any;
}

const MARKET_LABELS: Record<string, string> = {
  '1X2': '1X2',
  'OVER_25': 'Over 2.5',
  'OVER_35': 'Over 3.5',
  'BTTS': 'GG/NG',
  '1X2_HT': '1X2 PT',
  'OVER_05_HT': 'Over 0.5 PT',
  'OVER_15_HT': 'Over 1.5 PT',
  'BTTS_HT': 'GG/NG PT',
  'TOTAL_CARDS_OVER25': 'Cart. >2.5',
  'TOTAL_CARDS_OVER45': 'Cart. >4.5',
  'TOTAL_CORNERS_OVER85': 'Corner >8.5',
  'TOTAL_CORNERS_OVER105': 'Corner >10.5',
};

const COMP_LABELS: Record<number, string> = {
  2019: 'Serie A',
  2021: 'Premier League',
  2002: 'Bundesliga',
  2015: 'Ligue 1',
  2014: 'La Liga',
  2001: 'Champions League',
  2: 'Europa League',
  848: 'Conference League',
  136: 'Serie B',
  32: 'Qualif. Mondiali',
};

function cellColor(accuracy: number): string {
  if (accuracy >= 65) return 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30';
  if (accuracy >= 55) return 'bg-emerald-500/10 text-emerald-300';
  if (accuracy >= 45) return 'bg-yellow-500/10 text-yellow-300';
  if (accuracy >= 35) return 'bg-orange-500/10 text-orange-300';
  return 'bg-red-500/10 text-red-400';
}

function cellBg(accuracy: number): string {
  if (accuracy >= 65) return 'rgba(16, 185, 129, 0.15)';
  if (accuracy >= 55) return 'rgba(16, 185, 129, 0.08)';
  if (accuracy >= 45) return 'rgba(234, 179, 8, 0.08)';
  if (accuracy >= 35) return 'rgba(249, 115, 22, 0.08)';
  return 'rgba(239, 68, 68, 0.08)';
}

function KpiCard({ label, value, subtitle, icon: Icon, color }: {
  label: string; value: string; subtitle: string; icon: any; color: string;
}) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">{label}</span>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="text-3xl font-extrabold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-xs text-[var(--text-muted)] mt-1">{subtitle}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [pivot, setPivot] = useState<Record<string, Record<string, PivotCell>>>({});
  const [stats, setStats] = useState<StatsData | null>(null);
  const [marketTotals, setMarketTotals] = useState<Record<string, PivotCell>>({});
  const [compTotals, setCompTotals] = useState<Record<string, PivotCell>>({});
  const [loading, setLoading] = useState(true);
  const [markets, setMarkets] = useState<string[]>([]);
  const [comps, setComps] = useState<number[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [compRes, statsRes] = await Promise.all([
          fetch('/api/predictions/accuracy-by-competition'),
          fetch('/api/predictions/stats'),
        ]);

        const compData: any[] = compRes.ok ? await compRes.json() : [];
        const statsData = statsRes.ok ? await statsRes.json() : {};
        setStats(statsData);

        // Build pivot: competition -> marketType -> { accuracy, total, correct }
        const pivotMap: Record<string, Record<string, PivotCell>> = {};
        const mktTotals: Record<string, { correct: number; total: number }> = {};
        const cmpTotals: Record<string, { correct: number; total: number }> = {};
        const marketSet = new Set<string>();
        const compSet = new Set<number>();

        for (const row of compData) {
          const compId = String(row.competitionId);
          const mkt = row.marketType;
          if (!mkt) continue;

          marketSet.add(mkt);
          compSet.add(row.competitionId);

          if (!pivotMap[compId]) pivotMap[compId] = {};
          pivotMap[compId][mkt] = {
            accuracy: row.accuracy || 0,
            total: row.totalPredictions || 0,
            correct: row.correctPredictions || 0,
          };

          // Market totals
          if (!mktTotals[mkt]) mktTotals[mkt] = { correct: 0, total: 0 };
          mktTotals[mkt].correct += row.correctPredictions || 0;
          mktTotals[mkt].total += row.totalPredictions || 0;

          // Competition totals (1X2 only for overall)
          if (!cmpTotals[compId]) cmpTotals[compId] = { correct: 0, total: 0 };
          if (mkt === '1X2') {
            cmpTotals[compId].correct += row.correctPredictions || 0;
            cmpTotals[compId].total += row.totalPredictions || 0;
          }
        }

        // Convert totals to PivotCell
        const mktCells: Record<string, PivotCell> = {};
        for (const [k, v] of Object.entries(mktTotals)) {
          mktCells[k] = { ...v, accuracy: v.total > 0 ? (v.correct / v.total) * 100 : 0 };
        }

        const cmpCells: Record<string, PivotCell> = {};
        for (const [k, v] of Object.entries(cmpTotals)) {
          cmpCells[k] = { ...v, accuracy: v.total > 0 ? (v.correct / v.total) * 100 : 0 };
        }

        // Sort markets by predefined order
        const marketOrder = Object.keys(MARKET_LABELS);
        const sortedMarkets = [...marketSet].sort((a, b) => {
          const ia = marketOrder.indexOf(a);
          const ib = marketOrder.indexOf(b);
          return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        });

        // Sort competitions by 1X2 accuracy descending
        const sortedComps = [...compSet].sort((a, b) => {
          const accA = cmpCells[String(a)]?.accuracy || 0;
          const accB = cmpCells[String(b)]?.accuracy || 0;
          return accB - accA;
        });

        setPivot(pivotMap);
        setMarketTotals(mktCells);
        setCompTotals(cmpCells);
        setMarkets(sortedMarkets);
        setComps(sortedComps);
      } catch {
        // Handle silently
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--violet)]" />
      </div>
    );
  }

  // KPI calculations
  const totalPredictions = stats?.total || 0;
  const best1x2 = stats?.result1x2?.percentage || 0;
  const bestOver25 = stats?.resultOver25?.percentage || 0;
  const bestBtts = stats?.resultBtts?.percentage || 0;

  // Find best market overall
  const bestMarket = Object.entries(marketTotals)
    .filter(([_, v]) => v.total >= 20)
    .sort((a, b) => b[1].accuracy - a[1].accuracy)[0];

  // Find best competition
  const bestComp = Object.entries(compTotals)
    .filter(([_, v]) => v.total >= 10)
    .sort((a, b) => b[1].accuracy - a[1].accuracy)[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-[var(--emerald)]" />
          Analytics
        </h1>
        <p className="text-[var(--text-secondary)] mt-1">Performance del sistema di pronostici AI</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Pronostici Totali"
          value={totalPredictions.toLocaleString()}
          subtitle="partite analizzate"
          icon={Hash}
          color="var(--violet)"
        />
        <KpiCard
          label="1X2 Accuracy"
          value={`${best1x2.toFixed(1)}%`}
          subtitle={`${stats?.result1x2?.correct || 0} corretti su ${stats?.result1x2?.total || 0}`}
          icon={Target}
          color={best1x2 >= 50 ? 'var(--emerald)' : 'var(--gold)'}
        />
        <KpiCard
          label="Miglior Mercato"
          value={bestMarket ? `${bestMarket[1].accuracy.toFixed(1)}%` : '-'}
          subtitle={bestMarket ? MARKET_LABELS[bestMarket[0]] || bestMarket[0] : '-'}
          icon={Trophy}
          color="var(--emerald)"
        />
        <KpiCard
          label="Miglior Campionato"
          value={bestComp ? `${bestComp[1].accuracy.toFixed(1)}%` : '-'}
          subtitle={bestComp ? (COMP_LABELS[parseInt(bestComp[0])] || bestComp[0]) + ' (1X2)' : '-'}
          icon={BarChart3}
          color="var(--emerald)"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Over 2.5" value={`${bestOver25.toFixed(1)}%`} subtitle={`${stats?.resultOver25?.correct || 0}/${stats?.resultOver25?.total || 0}`} icon={TrendingUp} color={bestOver25 >= 55 ? 'var(--emerald)' : 'var(--gold)'} />
        <KpiCard label="Over 3.5" value={`${(stats?.resultOver35?.percentage || 0).toFixed(1)}%`} subtitle={`${stats?.resultOver35?.correct || 0}/${stats?.resultOver35?.total || 0}`} icon={TrendingUp} color={(stats?.resultOver35?.percentage || 0) >= 55 ? 'var(--emerald)' : 'var(--gold)'} />
        <KpiCard label="BTTS" value={`${bestBtts.toFixed(1)}%`} subtitle={`${stats?.resultBtts?.correct || 0}/${stats?.resultBtts?.total || 0}`} icon={Percent} color={bestBtts >= 55 ? 'var(--emerald)' : 'var(--gold)'} />
      </div>

      {/* Pivot Table: Competition x Market Type */}
      {markets.length > 0 && comps.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="font-bold flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-[var(--violet)]" />
            Matrice Accuratezza: Competizione x Mercato
          </h3>
          <p className="text-xs text-[var(--text-muted)] mb-4">
            Ogni cella mostra l'accuratezza %. Verde &ge;65%, verde chiaro &ge;55%, giallo &ge;45%, arancione &ge;35%, rosso &lt;35%
          </p>

          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-2 text-[var(--text-muted)] font-medium sticky left-0 bg-[var(--background)] z-10 min-w-[130px]">
                    Competizione
                  </th>
                  {markets.map(mkt => (
                    <th key={mkt} className="p-2 text-center text-[var(--text-muted)] font-medium whitespace-nowrap min-w-[70px]">
                      {MARKET_LABELS[mkt] || mkt}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comps.map(compId => {
                  const compKey = String(compId);
                  const row = pivot[compKey] || {};
                  const compLabel = COMP_LABELS[compId] || `Comp ${compId}`;

                  return (
                    <tr key={compId} className="border-t border-[var(--border)]/30">
                      <td className="p-2 font-medium text-sm sticky left-0 bg-[var(--background)] z-10 whitespace-nowrap">
                        {compLabel}
                        {compTotals[compKey] && (
                          <span className="text-[var(--text-muted)] ml-1 font-normal">
                            ({compTotals[compKey].total})
                          </span>
                        )}
                      </td>
                      {markets.map(mkt => {
                        const cell = row[mkt];
                        if (!cell || cell.total === 0) {
                          return (
                            <td key={mkt} className="p-1.5 text-center">
                              <span className="text-[var(--text-muted)]">-</span>
                            </td>
                          );
                        }
                        return (
                          <td key={mkt} className="p-1.5 text-center">
                            <div
                              className={`rounded-md px-2 py-1.5 font-bold tabular-nums ${cellColor(cell.accuracy)}`}
                              style={{ backgroundColor: cellBg(cell.accuracy) }}
                              title={`${cell.correct}/${cell.total} corretti`}
                            >
                              {cell.accuracy.toFixed(0)}%
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Totals row */}
                <tr className="border-t-2 border-[var(--border)]">
                  <td className="p-2 font-bold text-sm sticky left-0 bg-[var(--background)] z-10">
                    TOTALE
                  </td>
                  {markets.map(mkt => {
                    const cell = marketTotals[mkt];
                    if (!cell || cell.total === 0) {
                      return <td key={mkt} className="p-1.5 text-center"><span className="text-[var(--text-muted)]">-</span></td>;
                    }
                    return (
                      <td key={mkt} className="p-1.5 text-center">
                        <div
                          className={`rounded-md px-2 py-1.5 font-extrabold tabular-nums ${cellColor(cell.accuracy)}`}
                          style={{ backgroundColor: cellBg(cell.accuracy) }}
                          title={`${cell.correct}/${cell.total} corretti`}
                        >
                          {cell.accuracy.toFixed(0)}%
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-emerald-500/20 ring-1 ring-emerald-500/30" />
          <span>&ge;65%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-emerald-500/10" />
          <span>&ge;55%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-yellow-500/10" />
          <span>&ge;45%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-orange-500/10" />
          <span>&ge;35%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-500/10" />
          <span>&lt;35%</span>
        </div>
      </div>

      {markets.length === 0 && (
        <div className="glass-card p-12 text-center">
          <Activity className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <h3 className="text-lg font-bold mb-2">Dati insufficienti</h3>
          <p className="text-[var(--text-secondary)] text-sm">
            Le analytics saranno disponibili quando ci saranno abbastanza pronostici verificati.
          </p>
        </div>
      )}
    </div>
  );
}
