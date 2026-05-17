/**
 * VENHO fork — Phase 1 JSI data-path.
 *
 * The control plane stays the legacy `TcpSockets` NativeModule
 * (connect/write/listen/etc, autolinked normally). This block adds the
 * C++ cxxTurboModule that installs the zero-copy `TcpDataBridge` JSI
 * host object (read path off the legacy folly::dynamic bridge). Modeled
 * exactly on react-native-quick-base64's working RN-0.83 New-Arch wiring.
 *
 * @type {import('@react-native-community/cli-types').UserDependencyConfig}
 */
module.exports = {
  dependency: {
    platforms: {
      android: {
        cmakeListsPath: 'generated/jni/CMakeLists.txt',
        cxxModuleCMakeListsModuleName: 'react-native-tcp-socket',
        cxxModuleCMakeListsPath: 'CMakeLists.txt',
        cxxModuleHeaderName: 'TcpDataBridge',
      },
    },
  },
};
