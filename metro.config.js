const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro-конфиг по умолчанию + поддержка кадров/рамок в assets.
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    assetExts: ['png', 'jpg', 'jpeg', 'webp', 'ttf', 'otf', 'mp3', 'wav'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
