import { BASE_LONG_SIDE, frameSize, type Aspect, type SilhouetteSettings } from '@tools/silhouette';
import type { Option, Tab } from '@tools/ui';
import type { ReactNode } from 'react';

type S = SilhouetteSettings;

const pct = { unit: '%', scale: 100 } as const;

const size = (a: Aspect) => {
  const f = frameSize(a, BASE_LONG_SIDE);
  return `${f.w} × ${f.h}`;
};

export const ASPECT_OPTIONS: Option<Aspect>[] = [
  { value: '4:5', label: '4:5', sub: size('4:5') },
  { value: '1:1', label: '1:1', sub: size('1:1') },
  { value: '3:4', label: '3:4', sub: size('3:4') },
  { value: '9:16', label: '9:16', sub: size('9:16') },
  { value: '16:9', label: '16:9', sub: size('16:9') },
  { value: 'auto', label: 'Свой', sub: 'как у картинки', title: 'Пропорции загруженной картинки' },
];

export interface CustomSections {
  presets: () => ReactNode;
  gradient: () => ReactNode;
  reseed: () => ReactNode;
}

export type TabId = 'color' | 'glow' | 'frame';

export function silhouetteTabs(custom: CustomSections): Tab<S>[] {
  return [
    {
      id: 'color',
      label: 'Цвет',
      sections: [
        { id: 'presets', title: 'Пресеты', controls: [{ type: 'custom', render: custom.presets }] },
        { id: 'gradient', title: 'Градиент', controls: [{ type: 'custom', render: custom.gradient }] },
        {
          id: 'background',
          title: 'Фон',
          controls: [
            { type: 'color', key: 'bg', label: 'Цвет фона', visible: s => !s.transparent },
            { type: 'toggle', key: 'transparent', label: 'Прозрачный фон', hint: 'В PNG останется только свечение' },
          ],
        },
        {
          id: 'grain',
          title: 'Зерно',
          resettable: true,
          controls: [
            { type: 'slider', key: 'grain', label: 'Сила', min: 0, max: 0.4, step: 0.01, ...pct },
            { type: 'slider', key: 'grainSize', label: 'Размер', min: 1, max: 4, step: 0.5, unit: '×' },
            { type: 'custom', render: custom.reseed, visible: s => s.grain > 0 },
          ],
        },
      ],
    },
    {
      id: 'glow',
      label: 'Свечение',
      sections: [
        {
          id: 'glow',
          title: 'Свечение',
          resettable: true,
          controls: [
            {
              type: 'slider',
              key: 'depth',
              label: 'Глубина',
              min: 10,
              max: 200,
              step: 1,
              unit: '%',
              hint: 'Сколько формы окрашено до сердцевины',
            },
            { type: 'slider', key: 'soft', label: 'Мягкость края', min: 0, max: 8, step: 0.1, unit: '%' },
            { type: 'slider', key: 'glow', label: 'Ореол', min: 0, max: 20, step: 0.5, unit: '%' },
            { type: 'slider', key: 'glowAmt', label: 'Сила ореола', min: 0, max: 1, step: 0.01, ...pct },
          ],
        },
        {
          id: 'fine',
          title: 'Тонкая настройка',
          resettable: true,
          controls: [
            {
              type: 'slider',
              key: 'balance',
              label: 'Край ↔ сердцевина',
              min: 0.3,
              max: 3,
              step: 0.05,
              hint: 'Меньше — шире сердцевина, больше — шире край',
            },
            { type: 'slider', key: 'shift', label: 'Сдвиг цвета', min: -1, max: 1, step: 0.01, ...pct },
            {
              type: 'slider',
              key: 'detail',
              label: 'Детали исходника',
              min: -2,
              max: 2,
              step: 0.05,
              ...pct,
              hint: 'Тени картинки уходят в цвет',
            },
            { type: 'slider', key: 'tilt', label: 'Наклон цвета', min: -1, max: 1, step: 0.01, ...pct },
            {
              type: 'ruler',
              key: 'tiltAngle',
              label: 'Направление наклона',
              min: 0,
              max: 360,
              step: 1,
              major: 45,
              unit: '°',
              visible: s => s.tilt !== 0,
            },
          ],
        },
      ],
    },
    {
      id: 'frame',
      label: 'Кадр',
      sections: [
        {
          id: 'format',
          title: 'Формат кадра',
          controls: [
            { type: 'tiles', key: 'aspect', options: ASPECT_OPTIONS, columns: 3 },
            { type: 'slider', key: 'padding', label: 'Поля', min: 0, max: 40, step: 0.5, unit: '%' },
          ],
        },
      ],
    },
  ];
}
