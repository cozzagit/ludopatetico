'use client';

import { useSession } from 'next-auth/react';
import { useState } from 'react';
import {
  Crown, Check, X, Zap, Shield, TrendingUp, BarChart3, Target,
  CreditCard, Loader2, AlertCircle, CheckCircle2
} from 'lucide-react';

const PLANS = [
  {
    id: 'monthly',
    label: 'Mensile',
    price: '9,90',
    priceNum: 9.90,
    period: '/mese',
    popular: false,
  },
  {
    id: 'yearly',
    label: 'Annuale',
    price: '99',
    priceNum: 99.00,
    period: '/anno',
    popular: true,
    badge: 'Risparmia 17%',
  },
];

const FREE_FEATURES = [
  { text: 'Pronostici 1X2 base', included: true },
  { text: 'Over/Under 2.5', included: true },
  { text: '10 competizioni', included: true },
  { text: 'Dashboard con statistiche', included: true },
  { text: 'Storico pronostici', included: true },
  { text: 'Tutti i mercati (12)', included: false },
  { text: 'Scommesse raccomandate', included: false },
  { text: 'Primo tempo + BTTS', included: false },
  { text: 'Cartellini e Corner', included: false },
  { text: 'Infortuni e squalifiche', included: false },
  { text: 'Analytics premium', included: false },
];

const PREMIUM_FEATURES = [
  { text: 'Pronostici 1X2 base', included: true },
  { text: 'Over/Under 2.5', included: true },
  { text: '10 competizioni', included: true },
  { text: 'Dashboard con statistiche', included: true },
  { text: 'Storico pronostici', included: true },
  { text: 'Tutti i mercati (12)', included: true },
  { text: 'Scommesse raccomandate', included: true },
  { text: 'Primo tempo + BTTS', included: true },
  { text: 'Cartellini e Corner', included: true },
  { text: 'Infortuni e squalifiche', included: true },
  { text: 'Analytics premium', included: true },
];

export default function PremiumPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const [selectedPlan, setSelectedPlan] = useState('yearly');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isPremium = user?.isPremium || false;

  async function handleSubscribe() {
    if (!session) return;
    setProcessing(true);
    setError('');

    try {
      const res = await fetch('/api/premium/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Errore nella creazione dell\'ordine');
      }

      const data = await res.json();
      // Redirect to PayPal approval URL
      if (data.data?.approvalUrl) {
        window.location.href = data.data.approvalUrl;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }

  if (isPremium) {
    return (
      <div className="max-w-lg mx-auto mt-8">
        <div className="glass-card p-10 text-center border-[var(--gold)]/20">
          <div className="w-16 h-16 rounded-full gradient-gold flex items-center justify-center mx-auto mb-5 shadow-lg shadow-amber-500/30">
            <Crown className="w-8 h-8 text-black" />
          </div>
          <h2 className="text-2xl font-extrabold mb-2">Sei gia Premium!</h2>
          <p className="text-[var(--text-secondary)]">
            Hai accesso a tutti i pronostici e le funzionalita avanzate.
          </p>
          <div className="mt-6 p-4 rounded-lg bg-[var(--emerald)]/10 border border-[var(--emerald)]/20">
            <CheckCircle2 className="w-6 h-6 text-[var(--emerald)] mx-auto mb-2" />
            <span className="text-sm text-[var(--emerald)] font-medium">Abbonamento attivo</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--gold)]/10 text-[var(--gold)] text-sm font-medium mb-4">
          <Crown className="w-4 h-4" /> Football Oracle Premium
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold mb-3">
          Pronostici completi su <span className="gradient-text-gold">ogni partita</span>
        </h1>
        <p className="text-[var(--text-secondary)] text-lg max-w-xl mx-auto">
          12 mercati, scommesse raccomandate, analisi primo tempo, cartellini, corner e molto altro.
        </p>
      </div>

      {/* Highlights */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Target, label: '12 Mercati', color: 'var(--violet)' },
          { icon: Zap, label: 'AI Predictions', color: 'var(--emerald)' },
          { icon: Shield, label: 'Infortuni', color: 'var(--red)' },
          { icon: TrendingUp, label: 'Analytics Pro', color: 'var(--blue)' },
        ].map((h, i) => (
          <div key={i} className="glass-card p-4 text-center">
            <h.icon className="w-6 h-6 mx-auto mb-2" style={{ color: h.color }} />
            <div className="text-sm font-semibold">{h.label}</div>
          </div>
        ))}
      </div>

      {/* Pricing cards */}
      <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
        {PLANS.map(plan => (
          <button
            key={plan.id}
            onClick={() => setSelectedPlan(plan.id)}
            className={`glass-card p-6 text-center transition-all relative ${
              selectedPlan === plan.id
                ? 'ring-2 ring-[var(--gold)] shadow-lg shadow-amber-500/10'
                : 'hover:bg-[var(--card-hover)]'
            }`}>
            {plan.badge && (
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full gradient-gold text-black text-xs font-bold">
                {plan.badge}
              </div>
            )}
            <div className="text-sm text-[var(--text-muted)] mb-2">{plan.label}</div>
            <div className="text-4xl font-extrabold gradient-text-gold">&euro;{plan.price}</div>
            <div className="text-sm text-[var(--text-muted)] mt-1">{plan.period}</div>
            {selectedPlan === plan.id && (
              <div className="mt-3">
                <CheckCircle2 className="w-5 h-5 text-[var(--gold)] mx-auto" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Feature comparison */}
      <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
        {/* Free */}
        <div className="glass-card p-6">
          <h3 className="font-bold text-lg mb-4">Free</h3>
          <div className="space-y-3">
            {FREE_FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {f.included ? (
                  <Check className="w-4 h-4 text-[var(--emerald)] shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                )}
                <span className={f.included ? '' : 'text-[var(--text-muted)]'}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Premium */}
        <div className="glass-card p-6 border-[var(--gold)]/20">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            Premium <Crown className="w-4 h-4 text-[var(--gold)]" />
          </h3>
          <div className="space-y-3">
            {PREMIUM_FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-[var(--emerald)] shrink-0" />
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center">
        {error && (
          <div className="flex items-center justify-center gap-2 text-[var(--red)] text-sm mb-4">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {session ? (
          <button
            onClick={handleSubscribe}
            disabled={processing}
            className="px-10 py-4 rounded-xl gradient-gold text-black font-bold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-amber-500/25 disabled:opacity-50 flex items-center gap-2 mx-auto">
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Elaborazione...
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                Attiva Premium &mdash; &euro;{PLANS.find(p => p.id === selectedPlan)?.price}{PLANS.find(p => p.id === selectedPlan)?.period}
              </>
            )}
          </button>
        ) : (
          <a href="/register"
            className="inline-flex items-center gap-2 px-10 py-4 rounded-xl gradient-gold text-black font-bold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-amber-500/25">
            Registrati per iniziare
          </a>
        )}

        <p className="text-xs text-[var(--text-muted)] mt-3">
          Pagamento sicuro via PayPal. Cancella quando vuoi.
        </p>
      </div>
    </div>
  );
}
