const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Restrict Metro to only resolve modules from expo-mobile/node_modules
// This prevents it from crawling the parent workspace's node_modules
// (which contains web-app packages incompatible with React Native)
config.watchFolders = [projectRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
