import Link from 'next/link';
import { Zap, Brain, TrendingUp, BarChart3, Shield, Trophy, ChevronRight, Activity } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg gradient-violet flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold">Football Oracle</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-[var(--text-secondary)] hover:text-white transition-colors px-3 py-2">
              Accedi
            </Link>
            <Link href="/register" className="px-4 py-2 rounded-lg gradient-emerald text-white text-sm font-semibold hover:opacity-90 transition-opacity">
              Registrati gratis
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-violet/5 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-violet/10 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-80 h-80 bg-emerald/10 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--violet)]/30 bg-[var(--violet)]/10 text-[var(--violet)] text-sm font-medium mb-8">
            <Brain className="w-4 h-4" />
            Powered by Machine Learning
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-tight mb-6">
            Pronostici calcio
            <br />
            <span className="gradient-text-violet">intelligenti</span>
          </h1>

          <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed">
            Analisi AI avanzata su <strong className="text-white">10 competizioni</strong> europee.
            12 mercati per partita. Sistema di apprendimento che migliora nel tempo.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link href="/register"
              className="px-8 py-3.5 rounded-xl gradient-emerald text-white font-bold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-emerald-500/25 flex items-center gap-2">
              Inizia gratis <ChevronRight className="w-5 h-5" />
            </Link>
            <Link href="/login"
              className="px-8 py-3.5 rounded-xl border border-[var(--border)] text-white font-semibold text-lg hover:bg-[var(--card-hover)] transition-colors">
              Ho gia un account
            </Link>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {[
              { value: '10', label: 'Campionati', color: 'var(--violet)' },
              { value: '12', label: 'Mercati', color: 'var(--emerald)' },
              { value: '24/7', label: 'Monitoraggio', color: 'var(--blue)' },
              { value: 'AI', label: 'Self-Learning', color: 'var(--gold)' },
            ].map((stat, i) => (
              <div key={i} className="glass-card p-4">
                <div className="text-2xl font-extrabold mb-1" style={{ color: stat.color }}>
                  {stat.value}
                </div>
                <div className="text-sm text-[var(--text-muted)]">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold mb-4">Come funziona</h2>
            <p className="text-[var(--text-secondary)] text-lg max-w-xl mx-auto">
              Un sistema multi-layer che analizza dati reali per generare pronostici affidabili
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Brain,
                title: 'Analisi AI Multi-Fattore',
                description: 'Forma recente, classifica, scontri diretti, statistiche avanzate, infortuni e squalifiche. Tutto elaborato da algoritmi proprietari.',
                gradient: 'gradient-violet',
                glow: 'shadow-violet/20',
              },
              {
                icon: TrendingUp,
                title: '12 Mercati per Partita',
                description: '1X2, Over/Under (1.5, 2.5, 3.5), BTTS, primo tempo, cartellini e calci d\'angolo. Ogni mercato con probabilita percentuali.',
                gradient: 'gradient-emerald',
                glow: 'shadow-emerald-500/20',
              },
              {
                icon: Activity,
                title: 'Sistema di Apprendimento',
                description: 'Ogni pronostico viene verificato e il sistema aggiorna i suoi pesi. Piu partite analizza, piu diventa preciso.',
                gradient: 'gradient-gold',
                glow: 'shadow-amber-500/20',
              },
            ].map((feature, i) => (
              <div key={i} className="glass-card p-7 hover:bg-[var(--card-hover)] transition-all duration-300 group">
                <div className={`w-12 h-12 rounded-xl ${feature.gradient} flex items-center justify-center mb-5 shadow-lg ${feature.glow} group-hover:scale-110 transition-transform`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-[var(--text-secondary)] leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Competitions */}
      <section className="py-20 border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold mb-4">Competizioni monitorate</h2>
            <p className="text-[var(--text-secondary)] text-lg">I migliori campionati europei e le coppe internazionali</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {[
              { name: 'Serie A', code: 'SA' },
              { name: 'Serie B', code: 'SB' },
              { name: 'Premier League', code: 'PL' },
              { name: 'La Liga', code: 'PD' },
              { name: 'Bundesliga', code: 'BL1' },
              { name: 'Ligue 1', code: 'FL1' },
              { name: 'Champions League', code: 'CL' },
              { name: 'Europa League', code: 'EL' },
              { name: 'Conference League', code: 'ECL' },
              { name: 'Qual. Mondiali', code: 'WCQ' },
            ].map((comp, i) => (
              <div key={i} className="glass-card p-4 text-center hover:bg-[var(--card-hover)] transition-colors">
                <Trophy className="w-6 h-6 mx-auto mb-2 text-[var(--gold)]" />
                <div className="text-sm font-semibold">{comp.name}</div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{comp.code}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Premium section */}
      <section className="py-20 border-t border-[var(--border)] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-transparent to-amber-500/5" />
        <div className="relative max-w-6xl mx-auto px-4">
          <div className="glass-card p-10 md:p-14 text-center border-[var(--gold)]/20">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--gold)]/10 text-[var(--gold)] text-sm font-medium mb-6">
              <Shield className="w-4 h-4" /> Premium
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold mb-4">Sblocca tutti i pronostici</h2>
            <p className="text-[var(--text-secondary)] text-lg max-w-xl mx-auto mb-8">
              Accesso completo a tutti i mercati, scommesse raccomandate, infortuni e analisi premium per ogni partita.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="glass-card px-8 py-5 text-center">
                <div className="text-sm text-[var(--text-muted)] mb-1">Mensile</div>
                <div className="text-3xl font-extrabold gradient-text-gold">&euro;9,90</div>
                <div className="text-sm text-[var(--text-muted)]">al mese</div>
              </div>
              <div className="glass-card px-8 py-5 text-center border-[var(--gold)]/30 relative">
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full gradient-gold text-black text-xs font-bold">
                  -17%
                </div>
                <div className="text-sm text-[var(--text-muted)] mb-1">Annuale</div>
                <div className="text-3xl font-extrabold gradient-text-gold">&euro;99</div>
                <div className="text-sm text-[var(--text-muted)]">all&apos;anno</div>
              </div>
            </div>
            <Link href="/register"
              className="inline-flex items-center gap-2 mt-8 px-8 py-3 rounded-xl gradient-gold text-black font-bold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-amber-500/25">
              Inizia ora <ChevronRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded gradient-violet flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            Football Oracle &copy; {new Date().getFullYear()}
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="hover:text-white transition-colors">Accedi</Link>
            <Link href="/register" className="hover:text-white transition-colors">Registrati</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
