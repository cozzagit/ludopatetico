'use client';

import { useSession } from 'next-auth/react';
import { useState } from 'react';
import {
  Shield, RefreshCw, Zap, Database, TrendingUp, CheckCircle2,
  AlertCircle, Loader2, BarChart3, Brain, UserX, Clock, Blocks
} from 'lucide-react';

interface ActionButton {
  id: string;
  label: string;
  description: string;
  icon: any;
  endpoint: string;
  method: string;
  color: string;
  gradient: string;
}

const ACTIONS: ActionButton[] = [
  {
    id: 'sync-all',
    label: 'Sync Completo',
    description: 'Sincronizza tutte le competizioni + genera pronostici',
    icon: Database,
    endpoint: '/api/admin/sync-all',
    method: 'POST',
    color: 'var(--gold)',
    gradient: 'gradient-gold',
  },
  {
    id: 'sync-recent-results',
    label: 'Verifica Risultati',
    description: 'Aggiorna risultati e verifica accuratezza pronostici',
    icon: CheckCircle2,
    endpoint: '/api/admin/sync-recent-results',
    method: 'POST',
    color: 'var(--emerald)',
    gradient: 'gradient-emerald',
  },
  {
    id: 'generate-daily-predictions',
    label: 'Genera Pronostici',
    description: 'Genera pronostici AI per oggi + prossimi 2 giorni',
    icon: Brain,
    endpoint: '/api/admin/generate-daily-predictions',
    method: 'POST',
    color: 'var(--violet)',
    gradient: 'gradient-violet',
  },
  {
    id: 'regenerate-predictions',
    label: 'Rigenera Pronostici',
    description: 'Rigenera tutti i pronostici per partite upcoming',
    icon: RefreshCw,
    endpoint: '/api/admin/regenerate-predictions',
    method: 'POST',
    color: 'var(--blue)',
    gradient: 'gradient-blue',
  },
  {
    id: 'sync-live-scores',
    label: 'Sync Live',
    description: 'Aggiorna punteggi delle partite in corso',
    icon: Zap,
    endpoint: '/api/admin/sync-live-scores',
    method: 'POST',
    color: 'var(--emerald)',
    gradient: 'gradient-emerald',
  },
  {
    id: 'sync-injuries',
    label: 'Sync Infortuni',
    description: 'Sincronizza infortuni e squalifiche da API-Football',
    icon: UserX,
    endpoint: '/api/admin/sync-injuries',
    method: 'POST',
    color: 'var(--red)',
    gradient: 'gradient-red',
  },
  {
    id: 'calculate-accuracy',
    label: 'Calcola Accuratezza',
    description: 'Calcola accuratezza per tutte le partite finite',
    icon: BarChart3,
    endpoint: '/api/admin/calculate-accuracy',
    method: 'POST',
    color: 'var(--blue)',
    gradient: 'gradient-blue',
  },
  {
    id: 'rebuild-performance-stats',
    label: 'Rebuild Learning',
    description: 'Ricostruisci statistiche del sistema di apprendimento',
    icon: TrendingUp,
    endpoint: '/api/admin/rebuild-performance-stats',
    method: 'POST',
    color: 'var(--violet)',
    gradient: 'gradient-violet',
  },
  {
    id: 'sync-cups',
    label: 'Sync Coppe UEFA',
    description: 'Sincronizza Europa League e Conference League',
    icon: RefreshCw,
    endpoint: '/api/admin/sync-cups',
    method: 'POST',
    color: 'var(--gold)',
    gradient: 'gradient-gold',
  },
  {
    id: 'sync-market-odds',
    label: 'Sync Polymarket',
    description: 'Sincronizza quote dai mercati predittivi blockchain (Polymarket)',
    icon: Blocks,
    endpoint: '/api/admin/sync-market-odds',
    method: 'POST',
    color: 'var(--emerald)',
    gradient: 'gradient-emerald',
  },
];

export default function AdminPage() {
  const { data: session } = useSession();
  const user = session?.user as any;

  const [actionStates, setActionStates] = useState<Record<string, {
    loading: boolean;
    result?: string;
    error?: string;
  }>>({});

  if (!user?.isAdmin) {
    return (
      <div className="glass-card p-12 text-center max-w-lg mx-auto mt-12">
        <Shield className="w-12 h-12 text-[var(--red)] mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Accesso negato</h2>
        <p className="text-[var(--text-secondary)] text-sm">
          Questa pagina e riservata agli amministratori.
        </p>
      </div>
    );
  }

  async function runAction(action: ActionButton) {
    setActionStates(prev => ({
      ...prev,
      [action.id]: { loading: true },
    }));

    try {
      const res = await fetch(action.endpoint, { method: action.method });
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Risposta non valida (HTTP ${res.status})`);
      }

      if (!res.ok) {
        throw new Error(data.error?.message || data.message || `Errore HTTP ${res.status}`);
      }

      setActionStates(prev => ({
        ...prev,
        [action.id]: { loading: false, result: data.message || JSON.stringify(data) },
      }));
    } catch (err: any) {
      setActionStates(prev => ({
        ...prev,
        [action.id]: { loading: false, error: err.message },
      }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center shadow-lg shadow-amber-500/20">
          <Shield className="w-5 h-5 text-black" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold">Admin Panel</h1>
          <p className="text-[var(--text-secondary)] text-sm">Gestione dati e pronostici</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ACTIONS.map(action => {
          const state = actionStates[action.id];
          const Icon = action.icon;

          return (
            <div key={action.id} className="glass-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg ${action.gradient} flex items-center justify-center shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{action.label}</div>
                  <div className="text-xs text-[var(--text-muted)]">{action.description}</div>
                </div>
              </div>

              <button
                onClick={() => runAction(action)}
                disabled={state?.loading}
                className="w-full py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--card-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {state?.loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> In corso...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" /> Esegui
                  </>
                )}
              </button>

              {/* Result/Error feedback */}
              {state?.result && (
                <div className="mt-2 p-2 rounded bg-[var(--emerald)]/10 border border-[var(--emerald)]/20 text-xs text-[var(--emerald)] break-all">
                  <CheckCircle2 className="w-3 h-3 inline mr-1" />
                  {state.result.substring(0, 200)}
                </div>
              )}
              {state?.error && (
                <div className="mt-2 p-2 rounded bg-[var(--red)]/10 border border-[var(--red)]/20 text-xs text-[var(--red)] break-all">
                  <AlertCircle className="w-3 h-3 inline mr-1" />
                  {state.error.substring(0, 200)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Last sync info */}
      <div className="glass-card p-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Clock className="w-4 h-4" />
        Ultimo accesso admin: {new Date().toLocaleString('it-IT')}
      </div>
    </div>
  );
}
