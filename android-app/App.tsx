import React from 'react';
import {
  FlatList,
  Image,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import type { NotificationMessage } from '@phonelink/shared';
import { MAC_PORT } from './src/config';
import { ScanQrScreen } from './src/discovery/ScanQrScreen';
import { ConnectionState } from './src/net/linkClient';
import { useNotificationMirror } from './src/useNotificationMirror';

const STATUS_COLOR: Record<ConnectionState, string> = {
  connected: '#2f9e44',
  connecting: '#f08c00',
  disconnected: '#868e96',
};

const STATUS_LABEL: Record<ConnectionState, string> = {
  connected: 'Connected to Mac',
  connecting: 'Connecting…',
  disconnected: 'Disconnected',
};

function NotificationRow({ item }: { item: NotificationMessage }) {
  return (
    <View style={styles.row}>
      {item.icon ? (
        <Image
          style={styles.icon}
          source={{ uri: `data:image/png;base64,${item.icon}` }}
        />
      ) : (
        <View style={[styles.icon, styles.iconPlaceholder]} />
      )}
      <View style={styles.rowText}>
        <Text style={styles.rowApp} numberOfLines={1}>
          {item.app}
        </Text>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title || '(no title)'}
        </Text>
        <Text style={styles.rowBody} numberOfLines={2}>
          {item.text}
        </Text>
      </View>
    </View>
  );
}

function App(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const {
    state,
    openSettings,
    saveManualHost,
    beginPairing,
    unpair,
    setClipboardEnabled,
    sendCurrentClipboard,
  } = useNotificationMirror();
  const [showManual, setShowManual] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const [draftHost, setDraftHost] = React.useState('');

  React.useEffect(() => {
    setDraftHost(state.manualHost ?? '');
  }, [state.manualHost]);

  const pairedLabel = state.paired
    ? `Paired with ${state.paired.deviceName}`
    : 'Not paired — scan the QR in the Mac app';

  const targetLabel =
    state.targetSource === 'none'
      ? state.discoveryLikelyBlocked
        ? 'No Mac found — this network may block discovery'
        : 'Searching for your Mac on this network…'
      : `${state.target}:${MAC_PORT} · ${
          state.targetSource === 'manual'
            ? 'manual address'
            : state.deviceName ?? 'discovered'
        }`;

  if (scanning) {
    return (
      <ScanQrScreen
        onScanned={(host, token) => {
          beginPairing(host, token);
          setScanning(false);
        }}
        onCancel={() => setScanning(false)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.header}>
        <Text style={styles.heading}>PhoneLink Clone</Text>
        <View style={styles.statusRow}>
          <View
            style={[styles.dot, { backgroundColor: STATUS_COLOR[state.connection] }]}
          />
          <Text style={styles.statusText}>{STATUS_LABEL[state.connection]}</Text>
        </View>
        <Text style={styles.target}>{pairedLabel}</Text>
        <Text style={styles.target}>{targetLabel}</Text>
        {state.targetSource === 'none' &&
          state.discoveryLog.map((line, index) => (
            <Text key={`${line}-${index}`} style={styles.diagnostic}>
              {line}
            </Text>
          ))}
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setScanning(true)}>
            <Text style={styles.link}>Scan QR from Mac</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowManual(current => !current)}>
            <Text style={styles.link}>
              {showManual ? 'Hide manual address' : 'Enter address manually'}
            </Text>
          </TouchableOpacity>
          {state.paired && (
            <TouchableOpacity onPress={() => unpair()}>
              <Text style={styles.link}>Unpair</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {state.targetSource === 'none' && state.discoveryLikelyBlocked && !showManual && (
        <TouchableOpacity style={styles.banner} onPress={() => setShowManual(true)}>
          <Text style={styles.bannerTitle}>Discovery isn't finding your Mac</Text>
          <Text style={styles.bannerBody}>
            Scan the QR code in the Mac app's menu bar popup — that both finds your Mac and
            pairs the two devices. Typing the address alone will not pair them.
          </Text>
        </TouchableOpacity>
      )}

      {showManual && (
        <View style={styles.manualBox}>
          <Text style={styles.manualHint}>
            Some networks block the discovery protocol. Entering the address helps only if
            the devices are already paired — first-time setup needs the QR code.
          </Text>
          <TextInput
            style={styles.input}
            value={draftHost}
            onChangeText={setDraftHost}
            placeholder="192.168.1.9"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
          <View style={styles.manualButtons}>
            <TouchableOpacity onPress={() => saveManualHost(draftHost)}>
              <Text style={styles.link}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => saveManualHost(null)}>
              <Text style={styles.link}>Clear &amp; use discovery</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!state.accessGranted && (
        <TouchableOpacity style={styles.banner} onPress={openSettings}>
          <Text style={styles.bannerTitle}>Notification access required</Text>
          <Text style={styles.bannerBody}>
            Android cannot grant this automatically. Tap to open system settings and enable
            PhoneLink Clone, then return here.
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.counters}>
        <TouchableOpacity onPress={() => setClipboardEnabled(!state.clipboardEnabled)}>
          <Text style={styles.link}>
            Clipboard sync: {state.clipboardEnabled ? 'on' : 'off'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => sendCurrentClipboard()}>
          <Text style={styles.link}>Send clipboard to Mac</Text>
        </TouchableOpacity>
        {state.callActionError && (
          <Text style={styles.counterText}>
            Call action failed: {state.callActionError}
          </Text>
        )}
        {state.clipboardSkipped && (
          <Text style={styles.counterText}>Last clipboard item too large — skipped</Text>
        )}
      </View>

      <View style={styles.counters}>
        <Text style={styles.counterText}>Sent {state.sentCount}</Text>
        <Text style={styles.counterText}>
          Dropped while offline {state.droppedCount}
        </Text>
      </View>

      <FlatList
        data={state.feed}
        keyExtractor={item => item.id}
        renderItem={NotificationRow}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No notifications captured yet. Trigger one on this phone to see it here.
          </Text>
        }
        contentContainerStyle={state.feed.length === 0 ? styles.emptyWrap : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { padding: 20, paddingBottom: 12 },
  heading: { fontSize: 24, fontWeight: '700', color: '#212529' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusText: { fontSize: 15, color: '#343a40' },
  target: { fontSize: 12, color: '#868e96', marginTop: 2 },
  link: { fontSize: 12, color: '#1c7ed6', marginTop: 6 },
  headerActions: { flexDirection: 'row', gap: 18 },
  diagnostic: { fontSize: 10, color: '#adb5bd', fontFamily: 'monospace' },
  manualBox: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  manualHint: { fontSize: 12, color: '#495057', lineHeight: 17, marginBottom: 8 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#adb5bd',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: '#212529',
  },
  manualButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  banner: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#fff3bf',
  },
  bannerTitle: { fontWeight: '700', color: '#5c3c00', marginBottom: 4 },
  bannerBody: { color: '#5c3c00', fontSize: 13, lineHeight: 18 },
  counters: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  counterText: { fontSize: 12, color: '#868e96' },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#dee2e6',
    backgroundColor: '#ffffff',
  },
  icon: { width: 32, height: 32, borderRadius: 6, marginRight: 12 },
  iconPlaceholder: { backgroundColor: '#dee2e6' },
  rowText: { flex: 1 },
  rowApp: { fontSize: 11, color: '#868e96' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#212529' },
  rowBody: { fontSize: 13, color: '#495057' },
  empty: { textAlign: 'center', color: '#868e96', paddingHorizontal: 40 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
});

export default App;
