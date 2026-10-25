import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

const display = Manrope({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-display', display: 'swap' });

export const metadata: Metadata = {
  title: 'Smart Assignment To-Do',
  description: 'Paste an assignment, get a short prioritized to-do with text reminders.',
  manifest: '/manifest.webmanifest',
};
export const viewport: Viewport = { themeColor: '#0c0f16', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body>{children}</body>
    </html>
  );
}
