import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Icon, type IconName } from './icons';
import { colors } from './theme';

export interface DockTab<T extends string> {
  key: T;
  icon: IconName;
}

interface Props<T extends string> {
  tabs: DockTab<T>[];
  active: T;
  onSelect(key: T): void;
  actionIcon: IconName;
  onAction(): void;
}

const H = 60;
const PILL_W = 200;
const GAP = 18;
const ROUND_X = PILL_W + GAP;

/**
 * Floating ink dock: a pill of tabs joined to a round action button by a "gooey" neck.
 * The neck is two concave curves meeting the pill's cap and the circle's edge.
 */
export function Dock<T extends string>({ tabs, active, onSelect, actionIcon, onAction }: Props<T>) {
  const capX = PILL_W - H / 2 + 15;
  const circleX = ROUND_X + 15;
  const neck = `M${capX} 4 Q${(capX + circleX) / 2} 22 ${circleX} 4 L${circleX} ${H - 4} Q${
    (capX + circleX) / 2
  } ${H - 22} ${capX} ${H - 4} Z`;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.dock}>
        <View style={styles.pill} />
        <View style={styles.round} />
        <Svg style={StyleSheet.absoluteFill} width={ROUND_X + H} height={H}>
          <Path d={neck} fill={colors.navy} />
        </Svg>

        <View style={styles.tabs}>
          {tabs.map(tab => {
            const selected = tab.key === active;
            return (
              <Pressable
                key={tab.key}
                onPress={() => onSelect(tab.key)}
                style={[styles.tab, selected && styles.tabActive]}
                hitSlop={4}>
                <Icon name={tab.icon} color={selected ? colors.navy : '#aab4c8'} />
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={onAction} style={styles.action} hitSlop={6}>
          <Icon name={actionIcon} color={colors.white} size={26} strokeWidth={2.2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  dock: { width: ROUND_X + H, height: H },
  pill: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: PILL_W,
    height: H,
    borderRadius: H / 2,
    backgroundColor: colors.navy,
    boxShadow: '0 12px 24px rgba(11, 15, 23, 0.35)',
  },
  round: {
    position: 'absolute',
    left: ROUND_X,
    top: 0,
    width: H,
    height: H,
    borderRadius: H / 2,
    backgroundColor: colors.navy,
    boxShadow: '0 12px 24px rgba(11, 15, 23, 0.35)',
  },
  tabs: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: PILL_W,
    height: H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 6,
  },
  tab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.white },
  action: {
    position: 'absolute',
    left: ROUND_X,
    top: 0,
    width: H,
    height: H,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
