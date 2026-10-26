import {
  FRAME_FORMATS,
  FX_DEFAULTS,
  MAX_OFFSET,
  MAX_ZOOM,
  MIN_ZOOM,
  type GlobeSettings,
  type FxType,
  type Aspect,
} from '@tools/globe';
import type { Option, Tab } from '@tools/ui';
import type { ReactNode } from 'react';

type S = GlobeSettings;

const shapeIcon = (node: ReactNode) => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    {node}
  </svg>
);
const SHAPES: Option<S['shape']>[] = [
  { value: 'circle', label: '', title: 'Круг', icon: shapeIcon(<circle cx="7" cy="7" r="6" fill="currentColor" />) },
  {
    value: 'square',
    label: '',
    title: 'Квадрат',
    icon: shapeIcon(<rect x="1.5" y="1.5" width="11" height="11" rx="1.5" fill="currentColor" />),
  },
  {
    value: 'ring',
    label: '',
    title: 'Кольцо',
    icon: shapeIcon(<circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2.2" />),
  },
  {
    value: 'plus',
    label: '',
    title: 'Плюс',
    icon: shapeIcon(<path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2.6" />),
  },
  {
    value: 'hex',
    label: '',
    title: 'Шестиугольник',
    icon: shapeIcon(<path d="M7 .8 12.4 4v6L7 13.2 1.6 10V4z" fill="currentColor" />),
  },
  {
    value: 'diamond',
    label: '',
    title: 'Ромб',
    icon: shapeIcon(<path d="M7 .5 13.5 7 7 13.5.5 7z" fill="currentColor" />),
  },
  { value: 'glyph', label: '#', title: 'Символы ASCII' },
];

const fxIcon = (d: ReactNode) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    {d}
  </svg>
);
/** "No effect" in the effect menu: a crossed-out circle, so it lines up with the effects' icons. */
export const FX_OFF_ICON = fxIcon(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="m6.5 17.5 11-11" />
  </>,
);

export const FX_OPTIONS: Option<FxType>[] = [
  {
    value: 'random',
    label: 'Вспышки',
    icon: fxIcon(
      <>
        <circle cx="7" cy="8" r="2" />
        <circle cx="16" cy="15" r="3" />
        <circle cx="17" cy="6" r="1" />
      </>,
    ),
  },
  {
    value: 'center',
    label: 'Сонар',
    icon: fxIcon(
      <>
        <circle cx="12" cy="12" r="2" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="10" />
      </>,
    ),
  },
  {
    value: 'markers',
    label: 'От меток',
    icon: fxIcon(
      <>
        <path d="M12 3a5 5 0 0 0-5 5c0 4 5 10 5 10s5-6 5-10a5 5 0 0 0-5-5z" />
        <path d="M5 21h14" />
      </>,
    ),
  },
  {
    value: 'radar',
    label: 'Радар',
    icon: fxIcon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 12 18 6" />
      </>,
    ),
  },
  {
    value: 'scan',
    label: 'Сканер',
    icon: fxIcon(
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M4 12h16" />
      </>,
    ),
  },
  {
    value: 'meridian',
    label: 'Волна',
    icon: fxIcon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3c3 3 3 15 0 18" />
      </>,
    ),
  },
  {
    value: 'breath',
    label: 'Дыхание',
    icon: fxIcon(
      <>
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="9" strokeDasharray="2 3" />
      </>,
    ),
  },
];

const box = (w: number, h: number, dashed = false) => (
  <span style={{ width: w, height: h, border: `2px ${dashed ? 'dashed' : 'solid'} currentColor`, borderRadius: 4 }} />
);
const BOX: Record<string, [number, number]> = {
  '1:1': [22, 22],
  '4:5': [18, 22],
  '3:4': [17, 22],
  '16:9': [30, 17],
  '9:16': [13, 22],
};
export const FORMAT_OPTIONS: Option<Aspect>[] = [
  ...FRAME_FORMATS.map(f => ({ value: f.id, label: f.id, sub: `${f.w} × ${f.h}`, icon: box(...BOX[f.id]!) })),
  { value: 'custom', label: 'Свой', sub: 'ширина × высота', icon: box(24, 22, true) },
];

const WAVE_FX: FxType[] = ['random', 'center', 'markers'];
const pct = { unit: '%', scale: 100 } as const;

export interface CustomSections {
  presets: () => ReactNode;
  countries: () => ReactNode;
  markers: () => ReactNode;
  routes: () => ReactNode;
  customFrame: () => ReactNode;
}

export type TabId = 'style' | 'layers' | 'motion' | 'frame';

export function globeTabs(custom: CustomSections): Tab<S>[] {
  return [
    {
      id: 'style',
      label: 'Стиль',
      sections: [
        { id: 'presets', title: 'Пресеты', controls: [{ type: 'custom', render: custom.presets }] },
        {
          id: 'dots',
          title: 'Точки',
          resettable: true,
          shuffle: true,
          controls: [
            { type: 'segmented', key: 'shape', options: SHAPES, size: 'md' },
            {
              type: 'segmented',
              key: 'layout',
              label: 'Раскладка',
              options: [
                { value: 'rows', label: 'Ряды' },
                { value: 'hex', label: 'Соты' },
                { value: 'grid', label: 'Сетка' },
                { value: 'fib', label: 'Ровно' },
              ],
            },
            {
              type: 'slider',
              key: 'density',
              label: 'Плотность',
              min: 30,
              max: 320,
              step: 1,
              hint: 'Сколько рядов точек от полюса до полюса',
            },
            { type: 'slider', key: 'dotSize', label: 'Размер точки', min: 0.1, max: 1.6, step: 0.01, ...pct },
            {
              type: 'slider',
              key: 'edgeShrink',
              label: 'Перспектива',
              min: 0,
              max: 1,
              step: 0.01,
              ...pct,
              hint: 'Насколько точки мельчают к краю шара',
            },
            { type: 'slider', key: 'jitter', label: 'Разброс', min: 0, max: 1, step: 0.01, ...pct },
            { type: 'slider', key: 'backOpacity', label: 'Обратная сторона', min: 0, max: 0.6, step: 0.01, ...pct },
            { type: 'toggle', key: 'ocean', label: 'Точки в океане' },
            { type: 'color', key: 'oceanColor', label: 'Цвет океана', visible: s => s.ocean },
            {
              type: 'slider',
              key: 'oceanOpacity',
              label: 'Яркость океана',
              min: 0,
              max: 1,
              step: 0.01,
              ...pct,
              visible: s => s.ocean,
            },
            {
              type: 'slider',
              key: 'oceanSize',
              label: 'Точки океана',
              min: 0.1,
              max: 1.5,
              step: 0.01,
              ...pct,
              visible: s => s.ocean,
            },
          ],
        },
        {
          id: 'color',
          title: 'Цвет',
          resettable: true,
          controls: [
            {
              type: 'segmented',
              key: 'colorMode',
              label: 'Тип окраски',
              options: [
                { value: 'solid', label: 'Один' },
                { value: 'edge', label: 'Край', title: 'От центра к краю' },
                { value: 'lat', label: 'Широта' },
                { value: 'flow', label: 'Поток', title: 'Перелив цвета по шару' },
                { value: 'random', label: 'Шум', title: 'Случайный цвет у каждой точки' },
              ],
            },
            { type: 'color', key: 'colorA', label: 'Основной цвет' },
            { type: 'color', key: 'colorB', label: 'Второй цвет', visible: s => s.colorMode !== 'solid' },
            {
              type: 'slider',
              key: 'flowSpeed',
              label: 'Скорость перелива',
              min: 0,
              max: 1,
              step: 0.01,
              visible: s => s.colorMode === 'flow',
            },
            { type: 'slider', key: 'glow', label: 'Свечение', min: 0, max: 1, step: 0.01, ...pct },
            { type: 'color', key: 'atmoColor', label: 'Ореол' },
            { type: 'slider', key: 'atmo', label: 'Сила ореола', min: 0, max: 1, step: 0.01, ...pct },
            { type: 'slider', key: 'atmoWidth', label: 'Ширина ореола', min: 0.01, max: 0.3, step: 0.01, ...pct },
            { type: 'color', key: 'fillColor', label: 'Заливка шара' },
            { type: 'slider', key: 'fillOpacity', label: 'Сила заливки', min: 0, max: 1, step: 0.01, ...pct },
          ],
        },
        {
          id: 'background',
          title: 'Фон',
          resettable: true,
          controls: [
            {
              type: 'segmented',
              key: 'bgMode',
              options: [
                { value: 'solid', label: 'Цвет', title: 'Сплошной цвет' },
                { value: 'vertical', label: 'Градиент' },
                { value: 'radial', label: 'Свечение' },
                { value: 'transparent', label: 'Нет' },
              ],
            },
            { type: 'color', key: 'bg1', label: 'Цвет фона', visible: s => s.bgMode !== 'transparent' },
            {
              type: 'color',
              key: 'bg2',
              label: 'Второй цвет',
              visible: s => s.bgMode === 'vertical' || s.bgMode === 'radial',
            },
            {
              type: 'slider',
              key: 'vignette',
              label: 'Виньетка',
              min: 0,
              max: 1,
              step: 0.01,
              ...pct,
              visible: s => s.bgMode !== 'transparent',
            },
            {
              type: 'slider',
              key: 'grain',
              label: 'Зерно',
              min: 0,
              max: 0.3,
              step: 0.01,
              ...pct,
              visible: s => s.bgMode !== 'transparent',
            },
          ],
        },
      ],
    },
    {
      id: 'layers',
      label: 'Карта',
      sections: [
        {
          id: 'countries',
          title: 'Страны',
          count: s => s.countries.length,
          controls: [
            { type: 'custom', render: custom.countries },
            {
              type: 'toggle',
              key: 'countryClick',
              label: 'Выделять кликом',
              hint: 'Клик по шару добавляет или убирает страну',
            },
            { type: 'color', key: 'hiColor', label: 'Цвет выделения' },
            {
              type: 'slider',
              key: 'hiSize',
              label: 'Размер точек',
              min: 0.5,
              max: 2.5,
              step: 0.05,
              ...pct,
              hint: 'Размер точек выделенных стран',
            },
            {
              type: 'slider',
              key: 'hiDim',
              label: 'Затемнить мир',
              hint: 'Насколько приглушить невыделенные страны',
              min: 0,
              max: 1,
              step: 0.01,
              ...pct,
            },
          ],
        },
        {
          id: 'markers',
          title: 'Метки',
          count: s => s.markers.length,
          controls: [
            { type: 'custom', render: custom.markers },
            {
              type: 'segmented',
              key: 'markerSize',
              label: 'Размер меток',
              options: (['S', 'M', 'L', 'XL'] as const).map(v => ({ value: v, label: v })),
            },
            {
              type: 'segmented',
              key: 'markerStyle',
              label: 'Плашка',
              options: [
                { value: 'glass-dark', label: 'Тёмная', title: 'Тёмное стекло' },
                { value: 'glass-light', label: 'Светлая', title: 'Светлое стекло' },
                { value: 'solid', label: 'Сплошная' },
              ],
            },
            { type: 'color', key: 'markerAccent', label: 'Цвет булавки' },
            { type: 'color', key: 'markerText', label: 'Цвет текста' },
            { type: 'color', key: 'markerBg', label: 'Фон плашки', visible: s => s.markerStyle === 'solid' },
            { type: 'slider', key: 'markerLine', label: 'Высота ножки', min: 0, max: 120, step: 1, unit: 'px' },
            { type: 'toggle', key: 'markerPulse', label: 'Пульсирующее кольцо' },
          ],
        },
        {
          id: 'routes',
          title: 'Маршруты',
          count: s => s.routes.length,
          controls: [
            { type: 'note', text: 'Маршрут — дуга между двумя метками. Нажмите на название, чтобы поменять точку.' },
            { type: 'custom', render: custom.routes },
            { type: 'color', key: 'arcColor', label: 'Цвет линии' },
            { type: 'color', key: 'arcComet', label: 'Цвет огонька' },
            { type: 'slider', key: 'arcWidth', label: 'Толщина', min: 0.5, max: 5, step: 0.1, unit: 'px' },
            { type: 'slider', key: 'arcHeight', label: 'Высота дуги', min: 0, max: 1.2, step: 0.01, ...pct },
            { type: 'slider', key: 'arcOpacity', label: 'Яркость линии', min: 0, max: 1, step: 0.01, ...pct },
            { type: 'slider', key: 'arcSpeed', label: 'Скорость', min: 0, max: 1.5, step: 0.01, unit: '×' },
            { type: 'slider', key: 'arcCometLen', label: 'Длина хвоста', min: 0.03, max: 0.8, step: 0.01, ...pct },
            { type: 'toggle', key: 'arcDash', label: 'Пунктир' },
          ],
        },
      ],
    },
    {
      id: 'motion',
      label: 'Движение',
      sections: [
        {
          id: 'rotation',
          title: 'Вращение',
          controls: [
            {
              type: 'toggle',
              key: 'autoRotate',
              label: 'Вращать сам',
              hint: 'Останавливается, когда тянете шар мышью',
            },
            {
              type: 'slider',
              key: 'rotSpeed',
              label: 'Скорость',
              min: 0,
              max: 60,
              step: 1,
              unit: '°/с',
              visible: s => s.autoRotate,
            },
            {
              type: 'segmented',
              key: 'rotDir',
              visible: s => s.autoRotate,
              options: [
                { value: 1, label: 'С запада на восток' },
                { value: -1, label: 'С востока на запад' },
              ],
            },
          ],
        },
        {
          id: 'fx',
          title: 'Эффект поверх',
          toggleKey: 'fxOn',
          controls: [
            { type: 'tiles', key: 'fx', options: FX_OPTIONS, columns: 4, also: (v: FxType) => FX_DEFAULTS[v] },
            { type: 'color', key: 'fxColor', label: 'Цвет эффекта' },
            { type: 'slider', key: 'fxAmount', label: 'Яркость', min: 0, max: 1, step: 0.01, ...pct },
            { type: 'slider', key: 'fxSpeed', label: 'Скорость', min: 0.02, max: 1.5, step: 0.01, unit: '×' },
            {
              type: 'slider',
              key: 'fxWidth',
              label: 'Ширина',
              min: 0.5,
              max: 60,
              step: 0.5,
              unit: '°',
              visible: s => s.fx !== 'breath',
            },
            {
              type: 'slider',
              key: 'fxRange',
              label: 'Дальность волны',
              min: 5,
              max: 180,
              step: 1,
              unit: '°',
              visible: s => WAVE_FX.includes(s.fx),
            },
          ],
        },
        {
          id: 'shimmer',
          title: 'Мерцание точек',
          resettable: true,
          controls: [
            { type: 'slider', key: 'shimmer', label: 'Сила', min: 0, max: 1, step: 0.01, ...pct },
            { type: 'slider', key: 'shimmerSpeed', label: 'Скорость', min: 0.1, max: 4, step: 0.05, unit: '×' },
          ],
        },
        {
          id: 'daynight',
          title: 'День и ночь',
          toggleKey: 'dayNight',
          controls: [
            {
              type: 'segmented',
              key: 'sunMode',
              label: 'Солнце',
              options: [
                { value: 'real', label: 'Как сейчас' },
                { value: 'manual', label: 'Вручную' },
              ],
            },
            {
              type: 'ruler',
              key: 'sunLon',
              label: 'Долгота солнца',
              min: -180,
              max: 180,
              step: 5,
              major: 30,
              unit: '°',
              visible: s => s.sunMode === 'manual',
            },
            {
              type: 'slider',
              key: 'sunLat',
              label: 'Сезон',
              min: -23.4,
              max: 23.4,
              step: 0.1,
              unit: '°',
              visible: s => s.sunMode === 'manual',
              hint: 'Широта солнца: +23° — лето в северном полушарии',
            },
            { type: 'color', key: 'nightColor', label: 'Цвет ночи' },
            { type: 'slider', key: 'nightDim', label: 'Затемнение', min: 0, max: 1, step: 0.01, ...pct },
            { type: 'slider', key: 'nightSoft', label: 'Мягкость границы', min: 0.01, max: 0.5, step: 0.01, ...pct },
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
            { type: 'tiles', key: 'aspect', options: FORMAT_OPTIONS, columns: 3 },
            { type: 'custom', render: custom.customFrame, visible: s => s.aspect === 'custom' },
          ],
        },
        {
          id: 'position',
          title: 'Положение',
          resettable: true,
          controls: [
            { type: 'slider', key: 'zoom', label: 'Масштаб', min: MIN_ZOOM, max: MAX_ZOOM, step: 0.01, ...pct },
            { type: 'slider', key: 'offX', label: 'Сдвиг по X', min: -MAX_OFFSET, max: MAX_OFFSET, step: 0.01, ...pct },
            { type: 'slider', key: 'offY', label: 'Сдвиг по Y', min: -MAX_OFFSET, max: MAX_OFFSET, step: 0.01, ...pct },
            { type: 'ruler', key: 'roll', label: 'Наклон оси', min: -90, max: 90, step: 2, major: 10, unit: '°' },
          ],
        },
      ],
    },
  ];
}
