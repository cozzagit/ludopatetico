'use client';

import { useEffect, useState } from 'react';
import { Trophy, Loader2 } from 'lucide-react';
import { MatchCard } from '@/src/components/match/match-card';

const COMP_TABS = [
  { label: 'Tutte', value: 'all' },
  { label: 'Serie A', value: '2019' },
  { label: 'Serie B', value: '136' },
  { label: 'Premier League', value: '2021' },
  { label: 'La Liga', value: '2014' },
  { label: 'Bundesliga', value: '2002' },
  { label: 'Ligue 1', value: '2015' },
  { label: 'Champions League', value: '2001' },
  { label: 'Europa League', value: '2' },
  { label: 'Conference League', value: '848' },
];

export default function MatchesPage() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const url = activeTab === 'all'
          ? '/api/matches/upcoming?limit=50'
          : `/api/matches/upcoming?limit=50&competition=${activeTab}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setMatches(data.data || []);
        }
      } catch {
        // Silently handle
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activeTab]);

  // Group matches by date
  const grouped = matches.reduce<Record<string, any[]>>((acc, match) => {
    const date = new Date(match.utcDate).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(match);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Partite</h1>
        <p className="text-[var(--text-secondary)] mt-1">Prossime partite con pronostici AI</p>
      </div>

      {/* Competition tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {COMP_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab.value
                ? 'bg-[var(--violet)] text-white shadow-lg shadow-violet/25'
                : 'bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--card-hover)] hover:text-white border border-[var(--border)]'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Matches */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--violet)]" />
        </div>
      ) : matches.length > 0 ? (
        <div className="space-y-8">
          {Object.entries(grouped).map(([date, dateMatches]) => (
            <div key={date}>
              <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 first-letter:uppercase">
                {date}
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {dateMatches.map((match: any) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card p-12 text-center">
          <Trophy className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <h3 className="text-lg font-bold mb-2">Nessuna partita trovata</h3>
          <p className="text-[var(--text-secondary)] text-sm">
            Non ci sono partite in programma per questa competizione.
          </p>
        </div>
      )}
    </div>
  );
}
