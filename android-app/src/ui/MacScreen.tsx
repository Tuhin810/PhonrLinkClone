import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAC_PORT } from '../config';
import type { MirrorState } from '../useNotificationMirror';
import { Card, IconBubble, ListRow, Notice, PillButton, ScreenTitle, StatusChip } from './components';
import { Icon } from './icons';
import { colors, radius } from './theme';

interface Props {
  state: MirrorState;
  topInset: number;
  showManual: boolean;
  setShowManual(value: boolean): void;
  onScan(): void;
  onSaveManual(host: string | null): void;
  onUnpair(): void;
}

/** Everything about which Mac this phone talks to: pairing, address, discovery. */
export function MacScreen({
  state,
  topInset,
  showManual,
  setShowManual,
  onScan,
  onSaveManual,
  onUnpair,
}: Props) {
  const [draftHost, setDraftHost] = React.useState(state.manualHost ?? '');
  React.useEffect(() => setDraftHost(state.manualHost ?? ''), [state.manualHost]);

  const macName = state.paired?.deviceName ?? state.deviceName ?? 'No Mac yet';
  const targetLabel =
    state.targetSource === 'none'
      ? state.discoveryLikelyBlocked
        ? 'No Mac found — this network may block discovery'
        : 'Searching for your Mac on this network…'
      : `${state.target}:${MAC_PORT} · ${
          state.targetSource === 'manual' ? 'manual address' : 'discovered'
        }`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: topInset + 24 }]}>
      <ScreenTitle title="Your Mac" subtitle="Pairing and network address" />

      <Card style={styles.macCard}>
        <View style={styles.macTop}>
          <IconBubble icon="laptop" size={64} />
          <View style={styles.macText}>
            <Text style={styles.macName} numberOfLines={1}>
              {macName}
            </Text>
            <StatusChip state={state.connection} />
          </View>
        </View>
        <View style={styles.facts}>
          <Fact label="Pairing" value={state.paired ? 'Paired and encrypted' : 'Not paired yet'} />
          <Fact label="Address" value={targetLabel} />
        </View>
      </Card>

      <View style={styles.actions}>
        <PillButton icon="qr" label="Scan QR from Mac" variant="white" onPress={onScan} style={styles.grow} />
        <PillButton
          icon="edit"
          label={showManual ? 'Hide' : 'Address'}
          variant="ghost"
          onPress={() => setShowManual(!showManual)}
        />
      </View>

      {state.targetSource === 'none' && state.discoveryLikelyBlocked && !showManual && (
        <View style={styles.block}>
          <Notice
            icon="search"
            tone="warn"
            title="Discovery isn't finding your Mac"
            body="Scan the QR code in the Mac app's menu bar popup — that both finds your Mac and pairs the two devices. Typing the address alone will not pair them."
          />
        </View>
      )}

      {showManual && (
        <Card style={styles.manual}>
          <Text style={styles.manualTitle}>Mac address</Text>
          <Text style={styles.manualHint}>
            Some networks block discovery. Entering the address helps only if the devices are
            already paired — first-time setup needs the QR code.
          </Text>
          <TextInput
            style={styles.input}
            value={draftHost}
            onChangeText={setDraftHost}
            placeholder="192.168.1.9"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
          <View style={styles.manualButtons}>
            <PillButton label="Save" onPress={() => onSaveManual(draftHost)} style={styles.grow} />
            <PillButton
              label="Use discovery"
              variant="white"
              onPress={() => onSaveManual(null)}
              style={styles.outline}
            />
          </View>
        </Card>
      )}

      {state.targetSource === 'none' && state.discoveryLog.length > 0 && (
        <Card style={styles.log}>
          <Text style={styles.logTitle}>Discovery log</Text>
          {state.discoveryLog.map((line, index) => (
            <Text key={`${line}-${index}`} style={styles.logLine}>
              {line}
            </Text>
          ))}
        </Card>
      )}

      {state.paired && (
        <Card style={styles.block}>
          <ListRow
            icon="unlink"
            tint={colors.dangerSoft}
            fg={colors.danger}
            title="Unpair this Mac"
            subtitle="You'll need to scan the QR code again to reconnect"
            trailing={<Icon name="arrow" color={colors.danger} size={18} />}
            onPress={onUnpair}
            last
          />
        </Card>
      )}
    </ScrollView>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { paddingHorizontal: 10, paddingBottom: 130 },
  macCard: { padding: 18 },
  macTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  macText: { flex: 1, minWidth: 0, gap: 8 },
  macName: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.4 },
  facts: { marginTop: 18, gap: 8 },
  fact: { backgroundColor: colors.soft, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12 },
  factLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  factValue: { fontSize: 15, color: colors.text, marginTop: 2 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  grow: { flex: 1 },
  block: { marginTop: 12 },

  manual: { marginTop: 12, padding: 18 },
  manualTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  manualHint: { fontSize: 13, color: colors.muted, marginTop: 4, lineHeight: 18 },
  input: {
    marginTop: 14,
    height: 52,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.soft,
    fontSize: 17,
    color: colors.text,
  },
  manualButtons: { flexDirection: 'row', gap: 10, marginTop: 12 },
  outline: { borderWidth: 1, borderColor: colors.line },

  log: { marginTop: 12, padding: 18 },
  logTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, marginBottom: 6 },
  logLine: { fontSize: 11, color: colors.textSoft, fontFamily: 'monospace', lineHeight: 16 },
});
