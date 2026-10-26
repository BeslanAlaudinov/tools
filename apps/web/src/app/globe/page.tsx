import type { Metadata } from 'next';
import { GlobeTool } from '@/tools/globe/GlobeTool';

export const metadata: Metadata = {
  title: 'Globe',
  description: 'Вращающаяся Земля из точек: страны, метки, маршруты, эффекты, экспорт в PNG и код.',
};

export default function GlobePage() {
  return <GlobeTool />;
}
