'use client';

import Link from 'next/link';
import { Lock, Crown } from 'lucide-react';

interface PremiumGateProps {
  children: React.ReactNode;
  isPremium: boolean;
  label?: string;
}

export function PremiumGate({ children, isPremium, label = 'Contenuto Premium' }: PremiumGateProps) {
  if (isPremium) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Blurred content */}
      <div className="premium-blur select-none" aria-hidden="true">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--background)]/60 backdrop-blur-sm rounded-xl">
        <div className="glass-card p-8 text-center max-w-sm">
          <div className="w-14 h-14 rounded-full gradient-gold flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30">
            <Lock className="w-7 h-7 text-black" />
          </div>
          <h3 className="text-lg font-bold mb-2">{label}</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-5">
            Sblocca pronostici completi, scommesse raccomandate e analisi avanzate.
          </p>
          <Link href="/premium"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg gradient-gold text-black font-bold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-amber-500/25">
            <Crown className="w-4 h-4" /> Diventa Premium
          </Link>
        </div>
      </div>
    </div>
  );
}
