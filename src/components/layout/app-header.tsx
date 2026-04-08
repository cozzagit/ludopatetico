'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Trophy, BarChart3, Clock, Zap, Crown, Shield, Menu, X, TrendingUp } from 'lucide-react';
import { useState } from 'react';

export function AppHeader() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const user = session?.user as any;

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
    { href: '/matches', label: 'Partite', icon: Trophy },
    { href: '/predictions', label: 'Pronostici', icon: Zap },
    { href: '/history', label: 'Storico', icon: Clock },
    { href: '/analytics', label: 'Analytics', icon: TrendingUp },
  ];

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-lg gradient-violet flex items-center justify-center shadow-lg shadow-violet/20 group-hover:shadow-violet/40 transition-shadow">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="hidden sm:block">
            <span className="text-lg font-bold tracking-tight">Football Oracle</span>
            <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded-full bg-[var(--violet)]/20 text-[var(--violet)] font-medium align-top">AI</span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-0.5">
          {navLinks.map(link => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link key={link.href} href={link.href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                  active
                    ? 'text-white bg-[var(--card-hover)] font-medium'
                    : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--card-hover)]'
                }`}>
                <Icon className="w-4 h-4" />
                {link.label}
              </Link>
            );
          })}
          {user?.isPremium && (
            <span className="ml-2 px-2.5 py-0.5 text-xs rounded-full gradient-gold text-black font-bold tracking-wide">
              PRO
            </span>
          )}
          {user?.isAdmin && (
            <Link href="/admin" className={`px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive('/admin') ? 'text-[var(--gold)]' : 'text-[var(--text-muted)] hover:text-[var(--gold)]'
            }`}>
              <Shield className="w-4 h-4" />
            </Link>
          )}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {session ? (
            <div className="flex items-center gap-3">
              {!user?.isPremium && (
                <Link href="/premium"
                  className="hidden md:flex items-center gap-1.5 px-4 py-1.5 rounded-lg gradient-gold text-black text-sm font-bold hover:opacity-90 transition-opacity shadow-lg shadow-amber-500/20">
                  <Crown className="w-4 h-4" /> Premium
                </Link>
              )}
              <span className="hidden sm:block text-sm text-[var(--text-secondary)]">
                {session.user?.name}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-sm text-[var(--text-muted)] hover:text-white transition-colors">
                Esci
              </button>
            </div>
          ) : (
            <Link href="/login"
              className="px-4 py-2 rounded-lg gradient-emerald text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-emerald-500/20">
              Accedi
            </Link>
          )}
          <button className="md:hidden text-[var(--text-secondary)]" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-[var(--border)] bg-[var(--background)] px-4 py-3 space-y-1">
          {navLinks.map(link => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  active
                    ? 'text-white bg-[var(--card-hover)]'
                    : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--card-hover)]'
                }`}>
                <Icon className="w-4 h-4" /> {link.label}
              </Link>
            );
          })}
          {user?.isAdmin && (
            <Link href="/admin" onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--gold)] hover:bg-[var(--card-hover)]">
              <Shield className="w-4 h-4" /> Admin
            </Link>
          )}
          {!user?.isPremium && session && (
            <Link href="/premium" onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg gradient-gold text-black font-bold">
              <Crown className="w-4 h-4" /> Upgrade Premium
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
