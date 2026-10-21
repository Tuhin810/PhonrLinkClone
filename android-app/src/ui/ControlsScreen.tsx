import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { MirrorState } from '../useNotificationMirror';
import { Badge, Card, ListRow, ScreenTitle, SectionLabel } from './components';
import { Icon } from './icons';
import { colors, radius } from './theme';

interface Props {
  state: MirrorState;
  topInset: number;
  onToggleClipboard(enabled: boolean): void;
  onSendClipboard(): void;
  onSendFile(): void;
  onOpenNotificationAccess(): void;
  onOpenAccessibility(): void;
}

/** Sync switches, the permissions each feature depends on, and session counters. */
export function ControlsScreen({
  state,
  topInset,
  onToggleClipboard,
  onSendClipboard,
  onSendFile,
  onOpenNotificationAccess,
  onOpenAccessibility,
}: Props) {
  const transferLine = state.transfer
    ? `${state.transfer.direction === 'sending' ? 'Sending' : 'Receiving'} ${state.transfer.fileName} — ${
        state.transfer.done
      }/${state.transfer.total}`
    : state.transferError
      ? `Last transfer failed: ${state.transferError}`
      : 'Pick any file to send to your Mac';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: topInset + 24 }]}>
      <ScreenTitle title="Controls" subtitle="What syncs, and what it needs" />

      <Card>
        <ListRow
          icon="copy"
          title="Clipboard sync"
          subtitle={
            state.clipboardSkipped
              ? 'Last item was too large — skipped'
              : 'Copy on one device, paste on the other'
          }
          trailing={
            <Switch
              value={state.clipboardEnabled}
              onValueChange={onToggleClipboard}
              trackColor={{ false: colors.line, true: colors.ink }}
              thumbColor={colors.white}
            />
          }
        />
        <ListRow
          icon="send"
          title="Send clipboard now"
          subtitle="Push what you just copied to your Mac"
          trailing={<Icon name="arrow" color={colors.muted} size={18} />}
          onPress={onSendClipboard}
        />
        <ListRow
          icon="file"
          title="Send a file"
          subtitle={transferLine}
          trailing={<Icon name="arrow" color={colors.muted} size={18} />}
          onPress={onSendFile}
          last
        />
      </Card>

      <SectionLabel label="Permissions" />
      <Card>
        <ListRow
          icon="bell"
          title="Notification access"
          subtitle="Lets notifications mirror to your Mac"
          trailing={
            state.accessGranted ? <Badge label="On" tone="ok" /> : <Badge label="Turn on" tone="action" />
          }
          onPress={state.accessGranted ? undefined : onOpenNotificationAccess}
        />
        <ListRow
          icon="pointer"
          title="Remote control"
          subtitle="Accessibility service, so your Mac can tap and swipe"
          trailing={
            state.inputAvailable ? <Badge label="On" tone="ok" /> : <Badge label="Turn on" tone="action" />
          }
          onPress={state.inputAvailable ? undefined : onOpenAccessibility}
        />
        <ListRow
          icon="phone"
          title="Call alerts"
          subtitle={
            state.callActionError
              ? `Call action failed: ${state.callActionError}`
              : state.callPermission
                ? 'Incoming calls ring on your Mac'
                : 'Phone permission was declined — allow it in app settings'
          }
          trailing={
            state.callPermission ? <Badge label="On" tone="ok" /> : <Badge label="Off" tone="warn" />
          }
          last
        />
      </Card>

      <SectionLabel label="Screen sharing" />
      <Card>
        <ListRow
          icon="screen"
          title={state.mirroring ? 'Sharing with your Mac' : 'Not sharing'}
          subtitle={
            state.mirrorReason ??
            (state.lastInput
              ? `Last remote input: ${state.lastInput}`
              : 'Start it from “Phone screen” in the Mac app')
          }
          trailing={
            state.mirroring ? (
              <Badge label={state.inputAvailable ? 'Live' : 'View only'} tone="ok" />
            ) : (
              <Badge label="Idle" tone="muted" />
            )
          }
          last
        />
      </Card>

      <SectionLabel label="This session" />
      <View style={styles.stats}>
        <Stat value={state.sentCount} label="Sent to Mac" />
        <Stat value={state.droppedCount} label="Dropped offline" />
      </View>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { paddingHorizontal: 10, paddingBottom: 130 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    padding: 20,
    borderRadius: radius.card,
    experimental_backgroundImage: colors.heroGradient,
  },
  statValue: { fontSize: 40, fontWeight: '600', color: colors.text, letterSpacing: -1.5 },
  statLabel: { fontSize: 13, color: '#334155', marginTop: 2, fontWeight: '500' },
});
