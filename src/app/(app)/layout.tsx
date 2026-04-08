import { AppHeader } from '@/src/components/layout/app-header';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {children}
      </main>
      <footer className="border-t border-[var(--border)] py-4 text-center text-xs text-[var(--text-muted)]">
        Football Oracle &copy; {new Date().getFullYear()} &mdash; AI-Powered Predictions
      </footer>
    </div>
  );
}
