const {getDefaultConfig} = require('metro-config');
const defaultConfig = getDefaultConfig.getDefaultValues(__dirname);
const fs = require('fs');
const path = require('path');
const blacklist = require('metro-config/src/defaults/blacklist');
const escape = require('escape-string-regexp');

const root = path.resolve(__dirname, '../..');
const pak = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);

const modules = [
  '@babel/runtime',
  ...Object.keys({
    ...pak.dependencies,
    ...pak.peerDependencies,
  }),
];

module.exports = {
  projectRoot: __dirname,
  watchFolders: [root],
  resolver: {
    assetExts: [...defaultConfig.resolver.assetExts, 'pem', 'p12'],
    blacklistRE: blacklist([
      new RegExp(`^${escape(path.join(root, 'node_modules'))}\\/.*$`),
    ]),
    extraNodeModules: modules.reduce((acc, name) => {
      acc[name] = path.join(__dirname, 'node_modules', name);
      return acc;
    }, {}),
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: false,
      },
    }),
  },
};
