import '@tools/ui/styles.css';
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

const sans = Geist({ subsets: ['latin', 'cyrillic'], variable: '--font-sans', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin', 'cyrillic'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Библиотека инструментов', template: '%s — Библиотека инструментов' },
  description: 'Визуальные генераторы для дизайнеров: глобусы, градиенты, эффекты.',
};

export const viewport: Viewport = {
  themeColor: '#0b0b0c',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
