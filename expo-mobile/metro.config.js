const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('path');

// Sentry's helper wraps Expo's default Metro config so source maps work.
const config = getSentryExpoConfig(__dirname);

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === '@react-native-community/datetimepicker') {
    return {
      filePath: path.resolve(__dirname, 'src/shims/DateTimePicker.web.js'),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
