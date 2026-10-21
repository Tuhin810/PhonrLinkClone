import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'bell'
  | 'laptop'
  | 'sliders'
  | 'plus'
  | 'copy'
  | 'send'
  | 'qr'
  | 'edit'
  | 'screen'
  | 'pointer'
  | 'phone'
  | 'arrow'
  | 'unlink'
  | 'search'
  | 'check'
  | 'alert'
  | 'file';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Line icons on a 24px grid, drawn in one consistent stroke style. */
export function Icon({ name, size = 22, color = '#fff', strokeWidth = 1.9 }: Props) {
  const stroke = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {GLYPHS[name](stroke, color)}
    </Svg>
  );
}

type Stroke = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: string;
};

const GLYPHS: Record<IconName, (s: Stroke, color: string) => React.ReactNode> = {
  bell: s => (
    <>
      <Path d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9" {...s} />
      <Path d="M10.2 20.5a2 2 0 0 0 3.6 0" {...s} />
    </>
  ),
  laptop: s => (
    <>
      <Rect x="4" y="4.5" width="16" height="11.5" rx="2.5" {...s} />
      <Path d="M2 19.5h20" {...s} />
    </>
  ),
  sliders: s => (
    <>
      <Path d="M4 6.5h9M18 6.5h2M4 12h3M11 12h9M4 17.5h11M19 17.5h1" {...s} />
      <Circle cx="15.5" cy="6.5" r="2.2" {...s} />
      <Circle cx="9" cy="12" r="2.2" {...s} />
      <Circle cx="17" cy="17.5" r="2.2" {...s} />
    </>
  ),
  plus: s => <Path d="M12 5v14M5 12h14" {...s} />,
  copy: s => (
    <>
      <Rect x="8.5" y="8.5" width="12" height="12" rx="3" {...s} />
      <Path d="M15.5 8.5V6.5a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h2" {...s} />
    </>
  ),
  send: s => (
    <>
      <Path d="M20.5 3.5 10.8 13.2" {...s} />
      <Path d="M20.5 3.5 14.4 20.3a.6.6 0 0 1-1.1 0l-2.5-7.1-7.1-2.5a.6.6 0 0 1 0-1.1z" {...s} />
    </>
  ),
  qr: s => (
    <>
      <Rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5" {...s} />
      <Rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5" {...s} />
      <Rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5" {...s} />
      <Path d="M14 14h2.5v2.5M20.5 14v.01M14 20.5h.01M17.5 18v2.5h3V17" {...s} />
    </>
  ),
  edit: s => (
    <>
      <Path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" {...s} />
      <Path d="m13.5 6.5 4 4" {...s} />
    </>
  ),
  screen: (s, color) => (
    <>
      <Rect x="5.5" y="2" width="13" height="20" rx="3.5" {...s} />
      <Circle cx="12" cy="18.5" r="1" fill={color} />
    </>
  ),
  pointer: s => (
    <>
      <Path d="M9 11.5V5a1.5 1.5 0 0 1 3 0v5" {...s} />
      <Path d="M12 9.5a1.5 1.5 0 0 1 3 0v1M15 10a1.5 1.5 0 0 1 3 0v4.5a6.5 6.5 0 0 1-6.5 6.5h-.8a6 6 0 0 1-4.6-2.2L4 16a1.5 1.5 0 0 1 2.3-2L9 16.5" {...s} />
    </>
  ),
  phone: s => (
    <Path
      d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"
      {...s}
    />
  ),
  arrow: s => <Path d="M5 12h14M13 6l6 6-6 6" {...s} />,
  unlink: s => (
    <>
      <Path d="M9 15l-1.5 1.5a3.5 3.5 0 0 1-5-5L4 10M15 9l1.5-1.5a3.5 3.5 0 0 1 5 5L20 14" {...s} />
      <Path d="M8 2v3M2 8h3M16 22v-3M22 16h-3" {...s} />
    </>
  ),
  search: s => (
    <>
      <Circle cx="11" cy="11" r="6.5" {...s} />
      <Path d="m20 20-4.2-4.2" {...s} />
    </>
  ),
  check: s => <Path d="m5 12.5 4.5 4.5L19 7.5" {...s} />,
  alert: s => (
    <>
      <Circle cx="12" cy="12" r="9" {...s} />
      <Path d="M12 7.5v5.5M12 16.5v.01" {...s} />
    </>
  ),
  file: s => (
    <>
      <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" {...s} />
      <Path d="M14 3v5h5" {...s} />
    </>
  ),
};
