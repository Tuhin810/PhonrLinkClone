/**
 * @format
 */

// tweetnacl needs a CSPRNG, which React Native does not provide by default. This polyfills
// crypto.getRandomValues and must be imported before anything touches the crypto code.
import 'react-native-get-random-values';

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
