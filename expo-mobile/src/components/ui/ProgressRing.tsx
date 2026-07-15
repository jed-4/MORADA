import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../theme';

// Small circular progress indicator (e.g. "3 of 5 tasks done" beside a
// section title). Static — no animation.

interface ProgressRingProps {
  /** Outer diameter in px. */
  size?: number;
  strokeWidth?: number;
  /** 0..1 (clamped). */
  progress: number;
  /** Ring colour. Defaults to theme.statusSuccess. */
  color?: string;
  /** Track colour. Defaults to theme.border. */
  trackColor?: string;
}

export function ProgressRing({
  size = 20,
  strokeWidth = 3,
  progress,
  color,
  trackColor,
}: ProgressRingProps) {
  const theme = useTheme();
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const center = size / 2;

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={center}
        cy={center}
        r={r}
        stroke={trackColor || theme.border}
        strokeWidth={strokeWidth}
        fill="none"
      />
      {clamped > 0 && (
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={color || theme.statusSuccess}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={circumference * (1 - clamped)}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      )}
    </Svg>
  );
}
