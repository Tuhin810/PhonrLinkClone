import React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScanQrScreen } from './src/discovery/ScanQrScreen';
import { useNotificationMirror } from './src/useNotificationMirror';
import { ControlsScreen } from './src/ui/ControlsScreen';
import { Dock, type DockTab } from './src/ui/Dock';
import { HomeScreen } from './src/ui/HomeScreen';
import { MacScreen } from './src/ui/MacScreen';
import { colors } from './src/ui/theme';

type Tab = 'home' | 'mac' | 'controls';

const TABS: DockTab<Tab>[] = [
  { key: 'home', icon: 'bell' },
  { key: 'mac', icon: 'laptop' },
  { key: 'controls', icon: 'sliders' },
];

function Main(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const {
    state,
    openSettings,
    saveManualHost,
    beginPairing,
    unpair,
    setClipboardEnabled,
    sendCurrentClipboard,
    sendFile,
    openAccessibilitySettings,
  } = useNotificationMirror();
  const [tab, setTab] = React.useState<Tab>('home');
  const [showManual, setShowManual] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);

  if (scanning) {
    return (
      <ScanQrScreen
        onScanned={(host, token) => {
          beginPairing(host, token);
          setScanning(false);
          setTab('home');
        }}
        onCancel={() => setScanning(false)}
      />
    );
  }

  const openManual = () => {
    setShowManual(true);
    setTab('mac');
  };

  return (
    <View style={styles.root}>
      {/* Home opens on the light-blue hero; the other tabs are on ink. */}
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={tab === 'home' ? 'dark-content' : 'light-content'}
      />

      {tab === 'home' && (
        <HomeScreen
          state={state}
          topInset={insets.top}
          onScan={() => setScanning(true)}
          onManual={openManual}
          onControls={() => setTab('controls')}
          onOpenNotificationAccess={openSettings}
          onSendClipboard={() => sendCurrentClipboard()}
          onSendFile={() => sendFile()}
          onOpenMac={() => setTab('mac')}
        />
      )}
      {tab === 'mac' && (
        <MacScreen
          state={state}
          topInset={insets.top}
          showManual={showManual}
          setShowManual={setShowManual}
          onScan={() => setScanning(true)}
          onSaveManual={host => saveManualHost(host)}
          onUnpair={() => unpair()}
        />
      )}
      {tab === 'controls' && (
        <ControlsScreen
          state={state}
          topInset={insets.top}
          onToggleClipboard={setClipboardEnabled}
          onSendClipboard={() => sendCurrentClipboard()}
          onSendFile={() => sendFile()}
          onOpenNotificationAccess={openSettings}
          onOpenAccessibility={() => openAccessibilitySettings()}
        />
      )}

      <View style={[styles.dock, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
        <Dock<Tab>
          tabs={TABS}
          active={tab}
          onSelect={setTab}
          // Until paired, the primary action is pairing; afterwards it is sending a file.
          actionIcon={state.paired ? 'plus' : 'qr'}
          onAction={() => (state.paired ? sendFile() : setScanning(true))}
        />
      </View>
    </View>
  );
}

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});

export default App;
