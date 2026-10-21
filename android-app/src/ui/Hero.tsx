import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors, radius } from './theme';

/**
 * The sky-blue hero card with a band of water across its lower half. Pure decoration:
 * gradients and SVG curves, no images, so it scales to any phone width.
 */
export function Hero({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.hero, style]}>
      <Svg
        style={styles.water}
        viewBox="0 0 400 220"
        preserveAspectRatio="none"
        pointerEvents="none">
        <Defs>
          <LinearGradient id="front" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0.7" />
            <Stop offset="0.35" stopColor="#ffffff" stopOpacity="0.25" />
            <Stop offset="1" stopColor="#3f7fcb" stopOpacity="0.25" />
          </LinearGradient>
          <LinearGradient id="back" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
            <Stop offset="1" stopColor="#ffffff" stopOpacity="0.05" />
          </LinearGradient>
        </Defs>
        <Path d="M0 70 C 80 30, 150 40, 220 70 S 340 110, 400 50 L400 220 L0 220 Z" fill="url(#back)" />
        <Path d="M0 110 C 70 70, 150 70, 230 105 S 350 145, 400 95 L400 220 L0 220 Z" fill="url(#front)" />
        <Path
          d="M0 110 C 70 70, 150 70, 230 105 S 350 145, 400 95"
          stroke="#ffffff"
          strokeOpacity={0.85}
          strokeWidth={1.6}
          fill="none"
        />
        <Path
          d="M0 70 C 80 30, 150 40, 220 70 S 340 110, 400 50"
          stroke="#ffffff"
          strokeOpacity={0.5}
          strokeWidth={1}
          fill="none"
        />
        {BUBBLES.map(([cx, cy, r], index) => (
          <Circle
            key={index}
            cx={cx}
            cy={cy}
            r={r}
            stroke="#ffffff"
            strokeOpacity={0.75}
            strokeWidth={1}
            fill="#ffffff"
            fillOpacity={0.18}
          />
        ))}
      </Svg>
      {children}
    </View>
  );
}

const BUBBLES: [number, number, number][] = [
  [330, 60, 4],
  [352, 84, 2.5],
  [318, 98, 3],
  [366, 120, 5],
  [60, 150, 3.5],
  [96, 176, 2],
  [270, 168, 2.5],
];

const styles = StyleSheet.create({
  hero: {
    overflow: 'hidden',
    borderRadius: radius.hero,
    experimental_backgroundImage: colors.heroGradient,
  },
  water: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },
});
