import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SessionProvider } from 'next-auth/react';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Football Oracle — AI Predictions',
  description: 'Pronostici calcio AI con machine learning e analisi avanzata. Serie A, Premier League, Champions League e molto altro.',
  keywords: 'pronostici calcio, AI, machine learning, scommesse, predictions, serie a, premier league',
  openGraph: {
    title: 'Football Oracle — AI Predictions',
    description: 'Pronostici calcio AI con machine learning e analisi avanzata',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className="dark">
      <body className={`${inter.className} min-h-screen antialiased`}>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
