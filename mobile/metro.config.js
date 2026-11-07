// Lets the app import the rules and types in ../shared, which the server uses too.
// getSentryExpoConfig is Expo's default config plus the ids that let Sentry match
// a crash to its source map (data/crashes.ts).
const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../shared')];

module.exports = config;
