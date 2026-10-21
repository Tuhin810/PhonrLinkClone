import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import { parsePairingPayload } from '@phonelink/shared';

interface Props {
  onScanned(host: string, token: string | null, deviceName: string): void;
  onCancel(): void;
}

/**
 * Scans the pairing QR shown by the Mac app, so the address never has to be typed.
 *
 * Phase 5 will extend the payload with a public key and pairing token; this screen only needs
 * to keep handing the parsed payload upward when that happens.
 */
export function ScanQrScreen({ onScanned, onCancel }: Props) {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [error, setError] = useState<string | null>(null);
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    if (!hasPermission) requestPermission().catch(() => undefined);
  }, [hasPermission, requestPermission]);

  const handleCodes = useCallback(
    (codes: { value?: string }[]) => {
      // The scanner fires continuously; act once and let the parent unmount us.
      if (handled) return;
      for (const code of codes) {
        if (!code.value) continue;
        const payload = parsePairingPayload(code.value);
        if (!payload) {
          setError("That QR code isn't an ILink pairing code.");
          continue;
        }
        setHandled(true);
        // token is absent in v1 payloads; the Mac will then reject us as unpaired, which is
        // the correct outcome rather than connecting unauthenticated.
        onScanned(payload.host, payload.token ?? null, payload.device);
        return;
      }
    },
    [handled, onScanned],
  );

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: handleCodes,
  });

  return (
    <View style={styles.container}>
      {!hasPermission ? (
        <View style={styles.center}>
          <Text style={styles.message}>
            Camera access is needed to scan the pairing code.
          </Text>
          <TouchableOpacity onPress={() => requestPermission()}>
            <Text style={styles.action}>Grant camera access</Text>
          </TouchableOpacity>
        </View>
      ) : !device ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.message}>Opening camera…</Text>
        </View>
      ) : (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={!handled}
          codeScanner={codeScanner}
        />
      )}

      <View style={styles.overlay}>
        <Text style={styles.hint}>
          {error ?? 'Point at the QR code in the Mac app’s menu bar popup'}
        </Text>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.action}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  message: { color: '#f8f9fa', textAlign: 'center', marginBottom: 12, paddingHorizontal: 30 },
  hint: { color: '#f8f9fa', textAlign: 'center', marginBottom: 12 },
  action: { color: '#4dabf7', fontSize: 16, paddingVertical: 6 },
});
