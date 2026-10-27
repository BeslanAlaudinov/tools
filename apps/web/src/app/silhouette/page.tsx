import type { Metadata } from 'next';
import { SilhouetteTool } from '@/tools/silhouette/SilhouetteTool';

export const metadata: Metadata = {
  title: 'Силуэт',
  description:
    'Тепловой силуэт из PNG или SVG: края становятся ореолом, середина — плотным цветом. Экспорт в PNG и JPG.',
};

export default function SilhouettePage() {
  return <SilhouetteTool />;
}
