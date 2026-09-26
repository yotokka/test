import type { ReactNode, SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconBook = (p: P) => (
  <Svg {...p}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
    <path d="M8 7h8M8 10.5h6" />
  </Svg>
);
export const IconGlobe = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" />
  </Svg>
);
export const IconTable = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M9 9v11M15 9v11" />
  </Svg>
);
export const IconRadar = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <path d="M12 12l6-6" />
    <circle cx="16.5" cy="9" r="0.8" fill="currentColor" />
  </Svg>
);
export const IconLink = (p: P) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);
export const IconScale = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v18M5 21h14" />
    <path d="M6 7h12" />
    <path d="M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z" />
  </Svg>
);
export const IconInfo = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.01" />
  </Svg>
);
export const IconWarn = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l9.5 17h-19z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </Svg>
);
export const IconMenu = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconSliders = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Svg>
);
export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M7 5l12 7-12 7z" />
  </Svg>
);
export const IconPause = (p: P) => (
  <Svg {...p}>
    <path d="M8 5v14M16 5v14" />
  </Svg>
);
export const IconStep = (p: P) => (
  <Svg {...p}>
    <path d="M6 5l9 7-9 7z" />
    <path d="M18 5v14" />
  </Svg>
);
export const IconReset = (p: P) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1 0 2.3-5.7" />
    <path d="M4 4v4.5h4.5" />
  </Svg>
);
export const IconRepeat = (p: P) => (
  <Svg {...p}>
    <path d="M17 2l3 3-3 3" />
    <path d="M4 11V9a4 4 0 0 1 4-4h12" />
    <path d="M7 22l-3-3 3-3" />
    <path d="M20 13v2a4 4 0 0 1-4 4H4" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Svg>
);
export const IconExternal = (p: P) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Svg>
);
export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

/** Пиктограммы категорий: разные формы, а не только цвет. */
export const IconBallistic = (p: P) => (
  <Svg {...p}>
    <path d="M3 20c3-10 7-15 9-15s6 5 9 15" />
    <path d="M12 5l-1.5 2.5h3z" fill="currentColor" />
  </Svg>
);
export const IconCruise = (p: P) => (
  <Svg {...p}>
    <path d="M3 15c4-1 7-4 10-4s5 2 8 1" />
    <path d="M17 9l4 3-4 3" />
  </Svg>
);
export const IconSam = (p: P) => (
  <Svg {...p}>
    <path d="M5 20l7-15 7 15" />
    <path d="M8.5 13h7" />
    <circle cx="12" cy="5" r="1" fill="currentColor" />
  </Svg>
);

/** Маркеры статуса характеристики: квадрат — заявление, треугольник — испытания, круг — оценка. */
export function KindShape({ kind, size = 10 }: { kind: 'claim' | 'test' | 'estimate' | 'none'; size?: number }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      {kind === 'claim' && <rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" />}
      {kind === 'test' && <path d="M5 0.8L9.4 9H0.6z" fill="currentColor" />}
      {kind === 'estimate' && <circle cx="5" cy="5" r="4.2" fill="currentColor" />}
      {kind === 'none' && <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeDasharray="1.6 1.4" />}
    </svg>
  );
}

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true" focusable="false" className="brand-mark">
      <rect x="0.5" y="0.5" width="33" height="33" rx="9" fill="#222B38" stroke="rgba(167,178,191,0.3)" />
      <circle cx="17" cy="17" r="10" fill="none" stroke="#83B8AE" strokeWidth="1.4" />
      <circle cx="17" cy="17" r="5" fill="none" stroke="#83B8AE" strokeOpacity="0.5" />
      <path d="M17 5v24M5 17h24" stroke="#A7B2BF" strokeOpacity="0.35" />
      <path d="M17 17l7-5" stroke="#D5AD75" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="24" cy="12" r="1.6" fill="#D5AD75" />
    </svg>
  );
}
