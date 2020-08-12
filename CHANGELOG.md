# [4.3.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v4.2.0...v4.3.0) (2020-08-12)


### Features

* Add socket.setEncoding() method ([#74](https://github.com/Rapsssito/react-native-tcp-socket/issues/74)) ([bfa80ea](https://github.com/Rapsssito/react-native-tcp-socket/commit/bfa80ea3b690f8a486882b4921397633957f4686))

# [4.2.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v4.1.0...v4.2.0) (2020-07-06)


### Features

* Add setKeepAlive() method ([#62](https://github.com/Rapsssito/react-native-tcp-socket/issues/62)) ([35cea93](https://github.com/Rapsssito/react-native-tcp-socket/commit/35cea93d53f9d9bad9e28cf1a1657b8722335010))

# [4.1.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v4.0.0...v4.1.0) (2020-06-18)


### Bug Fixes

* **Android:** Fix server socket events not being delivered ([50e9b79](https://github.com/Rapsssito/react-native-tcp-socket/commit/50e9b793603bf84c74174c1c3b048746e6c26d90)), closes [#54](https://github.com/Rapsssito/react-native-tcp-socket/issues/54)


### Features

* Add setTimeout() method ([#56](https://github.com/Rapsssito/react-native-tcp-socket/issues/56)) ([e642e1a](https://github.com/Rapsssito/react-native-tcp-socket/commit/e642e1a1e2c89f51731d60c0776639e8bddef54b))

# [4.0.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.7.1...v4.0.0) (2020-06-16)


### Features

* Switch to NodeJS's EventEmitter as parent class ([#55](https://github.com/Rapsssito/react-native-tcp-socket/issues/55)) ([d21bb0b](https://github.com/Rapsssito/react-native-tcp-socket/commit/d21bb0b8d0ce0705c10bcde773088624a3bb95ec)), closes [#41](https://github.com/Rapsssito/react-native-tcp-socket/issues/41)


### BREAKING CHANGES

* Sockets will no longer return RemovableListeners when calling their addListener() method. Now they inherit all the event methods from Node's EventEmitter class.

## [3.7.1](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.7.0...v3.7.1) (2020-06-14)


### Bug Fixes

* Fix end() method on async write() ([a1a0771](https://github.com/Rapsssito/react-native-tcp-socket/commit/a1a0771efd7a5d25e5c035ed0437ba3886128cb1))

# [3.7.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.6.0...v3.7.0) (2020-06-14)


### Features

* Add setNoDelay() method ([#52](https://github.com/Rapsssito/react-native-tcp-socket/issues/52)) ([634aa6d](https://github.com/Rapsssito/react-native-tcp-socket/commit/634aa6d7cd7263883b0892786d786998fd4ca80f))

# [3.6.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.5.1...v3.6.0) (2020-05-13)


### Features

* Add macOS support ([#47](https://github.com/Rapsssito/react-native-tcp-socket/issues/47)) ([30736c7](https://github.com/Rapsssito/react-native-tcp-socket/commit/30736c765811d474201588399992e207780376af))

## [3.5.1](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.5.0...v3.5.1) (2020-05-07)


### Bug Fixes

* **Android:** Remove use of AsyncTask.THREAD_POOL_EXECUTOR ([#46](https://github.com/Rapsssito/react-native-tcp-socket/issues/46)) ([6372a8e](https://github.com/Rapsssito/react-native-tcp-socket/commit/6372a8e7ea567b9606c72ff4d93bebb471bbe602))

# [3.5.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.4.2...v3.5.0) (2020-04-08)


### Features

* SSL/TLS support ([#40](https://github.com/Rapsssito/react-native-tcp-socket/issues/40)) ([b617483](https://github.com/Rapsssito/react-native-tcp-socket/commit/b6174833e9c14bee1e5e823f95dc4397ab5db18a))

## [3.4.2](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.4.1...v3.4.2) (2020-04-06)


### Bug Fixes

* Fix write() callback invoking IOException objects ([f07ee07](https://github.com/Rapsssito/react-native-tcp-socket/commit/f07ee07b7cf85957634ebd1a7a71b65c7f7e7c77)), closes [#39](https://github.com/Rapsssito/react-native-tcp-socket/issues/39)

## [3.4.1](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.4.0...v3.4.1) (2020-04-05)


### Bug Fixes

* RN 62.0 compatibility ([#37](https://github.com/Rapsssito/react-native-tcp-socket/issues/37)) ([94627b7](https://github.com/Rapsssito/react-native-tcp-socket/commit/94627b7e2f214d6603e7c08ba091121557f712f9))

# [3.4.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.3.1...v3.4.0) (2020-02-27)


### Features

* **Android:** Connect from "cellular" & "ethernet" interfaces ([14bea9b](https://github.com/Rapsssito/react-native-tcp-socket/commit/14bea9b49db0971ac38142dcc91376d7d3752212))

## [3.3.1](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.3.0...v3.3.1) (2020-02-24)


### Bug Fixes

* Fixed TypeScript declaration files not being a module ([3e2213a](https://github.com/Rapsssito/react-native-tcp-socket/commit/3e2213a06c6917c8c0696cf31b905cd9e91f52e7))

# [3.3.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.2.9...v3.3.0) (2020-02-24)


### Features

* Add TypeScript declaration file ([#29](https://github.com/Rapsssito/react-native-tcp-socket/issues/29)) ([99d26b9](https://github.com/Rapsssito/react-native-tcp-socket/commit/99d26b981e66463baa2be174445f0a946f42ab4d))

## [3.2.9](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.2.8...v3.2.9) (2020-02-20)


### Bug Fixes

* Fixed an error when sending a Uint8Array from write() ([4d44d3e](https://github.com/Rapsssito/react-native-tcp-socket/commit/4d44d3e06a32d09bda683a55b4dc4629f51ee58d))

## [3.2.8](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.2.7...v3.2.8) (2020-02-18)


### Bug Fixes

* Fixed error removing already removed listeners ([7712876](https://github.com/Rapsssito/react-native-tcp-socket/commit/7712876bc6a61ee2efee57161f2a09dc5ff1b0a1))

## [3.2.7](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.2.6...v3.2.7) (2020-02-18)


### Bug Fixes

* **iOS:** Fixed error when connecting without localAddress ([18c430d](https://github.com/Rapsssito/react-native-tcp-socket/commit/18c430d5a357f075f91ec90402b0b12a5b4f7da3))

## [3.2.6](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.2.5...v3.2.6) (2020-02-11)


### Bug Fixes

* Fixed sockets concurrent events not firing ([1b8c574](https://github.com/Rapsssito/react-native-tcp-socket/commit/1b8c57455419ccc2b606101b16af56fc6fbb1162))

## [3.2.5](https://github.com/Rapsssito/react-native-tcp-socket/compare/v3.2.4...v3.2.5) (2020-02-05)


### Bug Fixes

* **Android:** Fixed connections being not concurrent ([c6ede32](https://github.com/Rapsssito/react-native-tcp-socket/commit/c6ede3295ef3920fb4cac6285c8991de330883ec))
