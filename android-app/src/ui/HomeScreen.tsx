import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NotificationMessage } from '@phonelink/shared';
import type { MirrorState } from '../useNotificationMirror';
import { Hero } from './Hero';
import { Icon } from './icons';
import { Notice, PillButton, StatusChip } from './components';
import { appLabel, clockTime, colors, radius } from './theme';

interface Props {
  state: MirrorState;
  topInset: number;
  onScan(): void;
  onManual(): void;
  onControls(): void;
  onOpenNotificationAccess(): void;
  onSendClipboard(): void;
  onSendFile(): void;
  onOpenMac(): void;
}

function formatCount(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function HomeScreen({
  state,
  topInset,
  onScan,
  onManual,
  onControls,
  onOpenNotificationAccess,
  onSendClipboard,
  onSendFile,
  onOpenMac,
}: Props) {
  const macName = state.paired?.deviceName ?? state.deviceName;
  const hasNotices = Boolean(
    !state.accessGranted ||
      (state.targetSource === 'none' && state.discoveryLikelyBlocked) ||
      state.transfer ||
      state.transferError ||
      state.mirroring,
  );
  const transferPct = state.transfer
    ? Math.round((state.transfer.done / Math.max(1, state.transfer.total)) * 100)
    : 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Edge to edge: the hero runs under the status bar, the sheet down to the bottom. */}
      <Hero style={{ ...styles.hero, paddingTop: topInset + 12 }}>
        <View style={styles.heroTop}>
          <StatusChip state={state.connection} glass />
          <Pressable style={styles.heroRound} onPress={onControls} hitSlop={6}>
            <Icon name="sliders" color={colors.text} size={20} />
          </Pressable>
        </View>

        <Text style={styles.heroLabel}>This session</Text>
        <View style={styles.heroNumberRow}>
          <Text style={styles.heroNumber}>{formatCount(state.sentCount)}</Text>
          <Text style={styles.heroUnit}>synced</Text>
        </View>
        <Text style={styles.heroSub} numberOfLines={1}>
          <Text style={styles.heroSubStrong}>{macName ?? 'Not paired'}</Text>
          {state.paired
            ? state.target
              ? `  ·  ${state.target}`
              : '  ·  looking for your Mac'
            : '  ·  scan the QR on your Mac'}
        </Text>

        <View style={styles.heroActions}>
          {state.paired ? (
            <>
              <PillButton icon="copy" label="Clipboard" onPress={onSendClipboard} />
              <PillButton icon="send" label="Send file" onPress={onSendFile} />
            </>
          ) : (
            <>
              <PillButton icon="edit" label="Address" onPress={onManual} />
              <PillButton icon="qr" label="Scan QR" onPress={onScan} />
            </>
          )}
        </View>
      </Hero>

      <View style={[styles.notices, !hasNotices && styles.noticesEmpty]}>
        {!state.accessGranted && (
          <Notice
            icon="bell"
            tone="warn"
            title="Notification access needed"
            body="Android can't grant this automatically. Tap to enable ILink in settings."
            onPress={onOpenNotificationAccess}
          />
        )}
        {state.targetSource === 'none' && state.discoveryLikelyBlocked && (
          <Notice
            icon="search"
            tone="warn"
            title="Can't find your Mac"
            body="This network may block discovery. Scan the QR in the Mac app to connect."
            onPress={onOpenMac}
          />
        )}
        {state.transfer && (
          <Notice
            icon="file"
            tone="info"
            title={`${state.transfer.direction === 'sending' ? 'Sending' : 'Receiving'} ${
              state.transfer.fileName
            }`}
            body={`${transferPct}%`}>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${transferPct}%` }]} />
            </View>
          </Notice>
        )}
        {state.transferError && (
          <Notice icon="alert" tone="danger" title="Transfer failed" body={state.transferError} />
        )}
        {state.mirroring && (
          <Notice
            icon="screen"
            tone="info"
            title="Sharing your screen with your Mac"
            body={state.inputAvailable ? 'Remote control is on' : 'View only'}
          />
        )}
      </View>

      <View style={styles.sheet}>
        {state.feed.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="bell" color={colors.white} size={26} />
            </View>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptyBody}>
              Notifications on this phone show up here and on your Mac.
            </Text>
          </View>
        ) : (
          state.feed.map((item, index) => (
            <NotificationRow key={item.id} item={item} last={index === state.feed.length - 1} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function NotificationRow({ item, last }: { item: NotificationMessage; last: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <View style={[styles.rowIcon, item.icon ? styles.rowIconWithImage : null]}>
        {item.icon ? (
          // The posting app's own full-colour launcher icon, filling the disc.
          <Image style={styles.rowIconImage} source={{ uri: `data:image/png;base64,${item.icon}` }} />
        ) : (
          <Text style={styles.rowLetter}>{appLabel(item.app).charAt(0)}</Text>
        )}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title || appLabel(item.app)}
        </Text>
        {item.text ? (
          <Text style={styles.rowBody} numberOfLines={2}>
            {item.text}
          </Text>
        ) : null}
        <Text style={styles.rowMeta}>
          {appLabel(item.app)}  ·  {clockTime(item.timestamp)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { flexGrow: 1 },
  hero: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },

  heroTop: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  heroRound: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  heroLabel: {
    marginTop: 38,
    paddingHorizontal: 26,
    fontSize: 26,
    fontWeight: '300',
    color: '#334155',
  },
  heroNumberRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 24, gap: 8 },
  heroNumber: { fontSize: 84, fontWeight: '600', color: colors.text, letterSpacing: -4, lineHeight: 92 },
  heroUnit: { fontSize: 28, fontWeight: '400', color: '#334155', marginBottom: 14 },
  heroSub: { paddingHorizontal: 26, fontSize: 15, color: '#475569', marginTop: 2 },
  heroSubStrong: { fontWeight: '700', color: colors.text },
  heroActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 120,
    paddingBottom: 20,
  },

  notices: { gap: 10, paddingHorizontal: 10, paddingTop: 28 },
  noticesEmpty: { paddingTop: 0 },
  bar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(91,138,214,0.2)', marginTop: 8, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.accentStrong },

  sheet: {
    flexGrow: 1,
    marginTop: 28,
    padding: 8,
    // Room for the floating dock, so the last notification scrolls clear of it.
    paddingBottom: 130,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconWithImage: { backgroundColor: colors.soft, overflow: 'hidden' },
  rowIconImage: { width: 52, height: 52 },
  rowLetter: { color: colors.white, fontSize: 20, fontWeight: '700' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  rowBody: { fontSize: 14, color: colors.textSoft, marginTop: 2, lineHeight: 19 },
  rowMeta: { fontSize: 12, color: colors.muted, marginTop: 4 },

  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 30 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 4, lineHeight: 20 },
});
