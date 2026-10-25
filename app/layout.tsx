import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Smart Assignment To-Do',
  description: 'Paste an assignment, get a short prioritized to-do with text reminders.',
  manifest: '/manifest.webmanifest',
};
export const viewport: Viewport = { themeColor: '#4f46e5' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
