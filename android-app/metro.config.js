const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// The protocol package lives outside this project root, so Metro has to be told to watch it
// and where to resolve modules from. Without this, `@phonelink/shared` imports fail at bundle
// time even though TypeScript resolves them fine.
const sharedRoot = path.resolve(__dirname, '../shared');

/**
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [sharedRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(sharedRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
