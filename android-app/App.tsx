import React from 'react';
import {
  FlatList,
  Image,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import type { NotificationMessage } from '@phonelink/shared';
import { MAC_HOST, MAC_PORT } from './src/config';
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
  const { state, openSettings } = useNotificationMirror();

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
        <Text style={styles.target}>
          {MAC_HOST}:{MAC_PORT}
        </Text>
      </View>

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
