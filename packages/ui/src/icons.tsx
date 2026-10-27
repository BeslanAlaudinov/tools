import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function make(paths: ReactNode, opts: { fill?: boolean; strokeWidth?: number } = {}) {
  return function Icon({ size = 18, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={opts.fill ? 'currentColor' : 'none'}
        stroke={opts.fill ? 'none' : 'currentColor'}
        strokeWidth={opts.strokeWidth ?? 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

export const ChevronLeft = make(<path d="m15 18-6-6 6-6" />);
export const ChevronDown = make(<path d="m6 9 6 6 6-6" />, { strokeWidth: 2.5 });
export const Check = make(<path d="M20 6 9 17l-5-5" />, { strokeWidth: 2.5 });
export const Close = make(<path d="m6 6 12 12M18 6 6 18" />, { strokeWidth: 2.5 });
export const Plus = make(<path d="M12 5v14M5 12h14" />, { strokeWidth: 2.5 });
export const Minus = make(<path d="M5 12h14" />, { strokeWidth: 2.5 });
export const Undo = make(
  <>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </>,
);
export const Redo = make(
  <>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9a5 5 0 0 0 0 10h3" />
  </>,
);
export const Reset = make(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </>,
);
export const Shuffle = make(
  <>
    <path d="M16 3h5v5" />
    <path d="M4 20 21 3" />
    <path d="M21 16v5h-5" />
    <path d="m15 15 6 6" />
    <path d="M4 4l5 5" />
  </>,
);
export const Refresh = make(
  <>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </>,
);
export const Download = make(
  <>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </>,
);
export const Upload = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M12 16V8" />
    <path d="m8.5 11.5 3.5-3.5 3.5 3.5" />
  </>,
  { strokeWidth: 1.5 },
);
export const UploadArrow = make(
  <>
    <path d="M12 15V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M5 20h14" />
  </>,
);
export const Person = make(
  <>
    <circle cx="12" cy="7" r="3" />
    <path d="M6 21v-3a6 6 0 0 1 12 0v3" />
  </>,
);
export const Compare = make(
  <>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M12 4v16" />
  </>,
);
export const Eye = make(
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
export const Pause = make(
  <>
    <rect x="6" y="5" width="4" height="14" rx="1.5" />
    <rect x="14" y="5" width="4" height="14" rx="1.5" />
  </>,
  { fill: true },
);
export const Play = make(<path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.5-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z" />, {
  fill: true,
});
export const Fit = make(
  <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />,
);
export const Search = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);
export const Pin = make(
  <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />,
  { fill: true },
);
export const Target = make(
  <>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
  </>,
);
export const Swap = make(
  <>
    <path d="m16 3 4 4-4 4" />
    <path d="M20 7H4" />
    <path d="m8 21-4-4 4-4" />
    <path d="M4 17h16" />
  </>,
);
export const Globe = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </>,
);
export const Hand = make(
  <path d="M18 11V7a2 2 0 0 0-4 0v3M14 10V5a2 2 0 0 0-4 0v5M10 10V7a2 2 0 0 0-4 0v7a8 8 0 0 0 14 4l1.5-3a2 2 0 0 0-3.4-2L18 15" />,
);
export const Cursor = make(
  <>
    <path d="m9 9 5 12 1.8-5.2L21 14z" />
    <path d="M7.2 2.2 8 5.1M5.1 8l-2.9-.8M14 4.1 12 6.2M6.2 12l-2.1 2" />
  </>,
);
export const Link = make(
  <>
    <path d="M9 15 15 9" />
    <path d="M11 6.5 12.5 5a3.5 3.5 0 0 1 5 5L16 11.5M8 12.5 6.5 14a3.5 3.5 0 0 0 5 5l1.5-1.5" />
  </>,
);
// alignment, as in Figma: the stroked line is the edge or axis, the filled bars are the aligned objects
const alignIcon = (line: string, bars: [number, number, number, number][]) =>
  make(
    <>
      <path d={line} />
      {bars.map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="1.25" fill="currentColor" stroke="none" />
      ))}
    </>,
    { strokeWidth: 1.75 },
  );
export const AlignLeft = alignIcon('M4 4v16', [
  [8, 7, 12, 4],
  [8, 13, 7, 4],
]);
export const AlignCenter = alignIcon('M12 4v16', [
  [5, 7, 14, 4],
  [8, 13, 8, 4],
]);
export const AlignRight = alignIcon('M20 4v16', [
  [4, 7, 12, 4],
  [9, 13, 7, 4],
]);
export const AlignTop = alignIcon('M4 4h16', [
  [7, 8, 4, 12],
  [13, 8, 4, 7],
]);
export const AlignMiddle = alignIcon('M4 12h16', [
  [7, 5, 4, 14],
  [13, 8, 4, 8],
]);
export const AlignBottom = alignIcon('M4 20h16', [
  [7, 4, 4, 12],
  [13, 9, 4, 7],
]);
// busy indicator; the `t-spin` class turns it
export const Spinner = make(<path d="M12 3a9 9 0 1 0 9 9" />, { strokeWidth: 2.5 });
