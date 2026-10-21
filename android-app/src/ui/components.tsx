import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { ConnectionState } from '../net/linkClient';
import { Icon, type IconName } from './icons';
import { colors, radius } from './theme';

export const STATUS_LABEL: Record<ConnectionState, string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  disconnected: 'Offline',
};

const STATUS_DOT: Record<ConnectionState, string> = {
  connected: colors.ok,
  connecting: colors.warn,
  disconnected: '#9aa1ae',
};

/** Dot + label pill. `glass` sits on the blue hero; the default sits on white cards. */
export function StatusChip({ state, glass }: { state: ConnectionState; glass?: boolean }) {
  return (
    <View style={[styles.chip, glass ? styles.chipGlass : styles.chipSoft]}>
      <View style={[styles.chipDot, { backgroundColor: STATUS_DOT[state] }]} />
      <Text style={styles.chipText}>{STATUS_LABEL[state]}</Text>
    </View>
  );
}

/** Ink pill with an icon, like the "+ Glass · 250 ml" buttons in the hero. */
export function PillButton({
  icon,
  label,
  onPress,
  variant = 'ink',
  style,
}: {
  icon?: IconName;
  label: string;
  onPress(): void;
  variant?: 'ink' | 'white' | 'ghost';
  style?: ViewStyle;
}) {
  const fg = variant === 'ink' ? colors.white : variant === 'white' ? colors.ink : colors.white;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        variant === 'ink' && styles.pillInk,
        variant === 'white' && styles.pillWhite,
        variant === 'ghost' && styles.pillGhost,
        pressed && styles.pressed,
        style,
      ]}>
      {icon && <Icon name={icon} color={fg} size={18} strokeWidth={2.2} />}
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Round tinted icon, the "water drop" motif from the reference design. */
export function IconBubble({
  icon,
  tint = colors.accent,
  fg = colors.white,
  size = 46,
}: {
  icon: IconName;
  tint?: string;
  fg?: string;
  size?: number;
}) {
  return (
    <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: tint }]}>
      <Icon name={icon} color={fg} size={size * 0.46} />
    </View>
  );
}

/** A settings-style row: bubble, title + subtitle, and a trailing element. */
export function ListRow({
  icon,
  tint,
  fg,
  title,
  subtitle,
  trailing,
  onPress,
  last,
}: {
  icon: IconName;
  tint?: string;
  fg?: string;
  title: string;
  subtitle?: string | null;
  trailing?: React.ReactNode;
  onPress?(): void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.rowPressed]}>
      <IconBubble icon={icon} tint={tint} fg={fg} size={42} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

/** Small trailing pill: "On" in green, an action like "Turn on" in ink. */
export function Badge({ label, tone }: { label: string; tone: 'ok' | 'action' | 'muted' | 'warn' }) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'ok' && { backgroundColor: colors.okSoft },
        tone === 'action' && { backgroundColor: colors.ink },
        tone === 'muted' && { backgroundColor: colors.soft },
        tone === 'warn' && { backgroundColor: colors.warnSoft },
      ]}>
      <Text
        style={[
          styles.badgeText,
          tone === 'ok' && { color: colors.ok },
          tone === 'action' && { color: colors.white },
          tone === 'muted' && { color: colors.muted },
          tone === 'warn' && { color: colors.warn },
        ]}>
        {label}
      </Text>
    </View>
  );
}

/** Coloured callout for things that need the user: permissions, errors, transfers. */
export function Notice({
  icon,
  title,
  body,
  tone,
  onPress,
  children,
}: {
  icon: IconName;
  title: string;
  body?: string | null;
  tone: 'warn' | 'danger' | 'info';
  onPress?(): void;
  children?: React.ReactNode;
}) {
  const palette = {
    warn: { bg: colors.warnSoft, fg: colors.warn },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    info: { bg: colors.accentSoft, fg: colors.accentStrong },
  }[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.notice, { backgroundColor: palette.bg }, pressed && styles.pressed]}>
      <IconBubble icon={icon} tint={colors.white} fg={palette.fg} size={38} />
      <View style={styles.rowText}>
        <Text style={[styles.noticeTitle, { color: palette.fg }]}>{title}</Text>
        {body ? <Text style={styles.noticeBody}>{body}</Text> : null}
        {children}
      </View>
      {onPress && <Icon name="arrow" color={palette.fg} size={18} />}
    </Pressable>
  );
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.screenTitle}>
      <Text style={styles.screenTitleText}>{title}</Text>
      {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionText}>{label}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: radius.pill,
  },
  chipGlass: { backgroundColor: 'rgba(255,255,255,0.45)' },
  chipSoft: { backgroundColor: colors.soft },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.text },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
  },
  pillInk: { backgroundColor: colors.navy },
  pillWhite: { backgroundColor: colors.white },
  pillGhost: { backgroundColor: 'rgba(255,255,255,0.12)' },
  pillText: { fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.card,
    padding: 6,
  },
  bubble: { alignItems: 'center', justifyContent: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 22,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowPressed: { backgroundColor: colors.soft },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowSubtitle: { fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18 },

  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  badgeText: { fontSize: 12, fontWeight: '700' },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 24,
  },
  noticeTitle: { fontSize: 15, fontWeight: '700' },
  noticeBody: { fontSize: 13, color: colors.textSoft, marginTop: 2, lineHeight: 18 },

  screenTitle: { paddingHorizontal: 24, paddingBottom: 18 },
  screenTitleText: { fontSize: 34, fontWeight: '700', color: colors.white, letterSpacing: -0.8 },
  screenSubtitle: { fontSize: 15, color: '#9ca3af', marginTop: 4 },

  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 26,
    paddingTop: 22,
    paddingBottom: 12,
  },
  sectionText: { fontSize: 15, color: '#9ca3af', fontWeight: '500' },
});
