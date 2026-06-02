// Exclude react-native-bluetooth-classic from iOS autolinking. The library
// uses Apple's ExternalAccessory framework, which requires MFi-certified
// accessories — none of which apply to commodity ELM327 clones. Linking it
// in regardless causes the iOS binary to instantiate the framework on launch,
// register an external-accessory client, and then SIGTRAP a few seconds later.
// The JS side already falls back to a stub on iOS via classic-transport.ios.ts.
module.exports = {
  dependencies: {
    'react-native-bluetooth-classic': {
      platforms: {
        ios: null,
      },
    },
  },
};
