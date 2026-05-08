// Metro config for Expo inside an npm workspaces monorepo.
//
// We only override one thing: appending the workspace root to watchFolders so
// edits in packages/* trigger fast refresh in the running Metro instance.
// Everything else is left at Expo SDK 54's defaults — they correctly resolve
// hoisted node_modules via standard hierarchical lookup, which is what
// `expo-doctor` expects.
//
// Reference: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];

module.exports = config;
