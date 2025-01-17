# [6.2.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v6.1.0...v6.2.0) (2024-07-08)


### Features

* **Android:** Add TLS key & cert for server ([#192](https://github.com/Rapsssito/react-native-tcp-socket/issues/192)) ([054c789](https://github.com/Rapsssito/react-native-tcp-socket/commit/054c7890dc0575acceb93c24794c0fade6c548a8))

# [6.1.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v6.0.6...v6.1.0) (2024-06-20)


### Features

* **Android:** Add support for Android concurrent connections (multiple networks) ([#193](https://github.com/Rapsssito/react-native-tcp-socket/issues/193)) ([a2d1a79](https://github.com/Rapsssito/react-native-tcp-socket/commit/a2d1a794421dbd44d1ada9c05c51fffc0085a67f))

## [6.0.6](https://github.com/Rapsssito/react-native-tcp-socket/compare/v6.0.5...v6.0.6) (2023-02-08)


### Bug Fixes

* **Android:** Avoid crash when writing on closed socket. ([466a5db](https://github.com/Rapsssito/react-native-tcp-socket/commit/466a5db0285f6ab688d32c81b682dd320999bbdc)), closes [#167](https://github.com/Rapsssito/react-native-tcp-socket/issues/167)

## [6.0.5](https://github.com/Rapsssito/react-native-tcp-socket/compare/v6.0.4...v6.0.5) (2023-01-30)


### Bug Fixes

* **iOS:** Throw specific error messages ([#171](https://github.com/Rapsssito/react-native-tcp-socket/issues/171)) ([8f39511](https://github.com/Rapsssito/react-native-tcp-socket/commit/8f3951199fcdd0806912e2a953d80db9466518a8))

## [6.0.4](https://github.com/Rapsssito/react-native-tcp-socket/compare/v6.0.3...v6.0.4) (2023-01-30)


### Bug Fixes

* Allow destroying socket while connecting ([#169](https://github.com/Rapsssito/react-native-tcp-socket/issues/169)) ([54cc248](https://github.com/Rapsssito/react-native-tcp-socket/commit/54cc2486ee4201d8c62bc9535610ff75f72b820d))

## [6.0.3](https://github.com/Rapsssito/react-native-tcp-socket/compare/v6.0.2...v6.0.3) (2022-11-21)


### Bug Fixes

* **Android:** Fix null error writing on disconnected socket ([59d3195](https://github.com/Rapsssito/react-native-tcp-socket/commit/59d3195a8c68eddb0341c8264d712ed2266d23b5))

## [6.0.2](https://github.com/Rapsssito/react-native-tcp-socket/compare/v6.0.1...v6.0.2) (2022-09-30)


### Bug Fixes

* Remove `timeout` from connection parameters ([16fea0b](https://github.com/Rapsssito/react-native-tcp-socket/commit/16fea0bea42274e88122d2fa70c7d29de1df8632))

## [6.0.1](https://github.com/Rapsssito/react-native-tcp-socket/compare/v6.0.0...v6.0.1) (2022-08-22)


### Bug Fixes

* Server never emits close event if no connections ([#156](https://github.com/Rapsssito/react-native-tcp-socket/issues/156)) ([6eec851](https://github.com/Rapsssito/react-native-tcp-socket/commit/6eec8519a9e2e74e7ec986eca518b4142d7365be)), closes [#144](https://github.com/Rapsssito/react-native-tcp-socket/issues/144)

# [6.0.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v5.6.2...v6.0.0) (2022-08-21)


### Features

* Add complete server/client TLS support ([#158](https://github.com/Rapsssito/react-native-tcp-socket/issues/158)) ([3264f44](https://github.com/Rapsssito/react-native-tcp-socket/commit/3264f4455cc0cf04fda643818dc3bed48e2d8f38))


### BREAKING CHANGES

* TLS client API now matches NodeJS official tls API.

## [5.6.2](https://github.com/Rapsssito/react-native-tcp-socket/compare/v5.6.1...v5.6.2) (2022-04-26)


### Bug Fixes

* **Android:** Add RN 0.65 event emitter stubs ([#151](https://github.com/Rapsssito/react-native-tcp-socket/issues/151)) ([8c025ef](https://github.com/Rapsssito/react-native-tcp-socket/commit/8c025ef19cc871c78b44960597ecce4cfd739c7f))

## [5.6.1](https://github.com/Rapsssito/react-native-tcp-socket/compare/v5.6.0...v5.6.1) (2022-04-18)


### Bug Fixes

* destroy & end work as no-op on closed streams ([b129cf3](https://github.com/Rapsssito/react-native-tcp-socket/commit/b129cf3b4b93e84bf79e36766ed296ffa8041bf2)), closes [#145](https://github.com/Rapsssito/react-native-tcp-socket/issues/145)

# [5.6.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v5.5.0...v5.6.0) (2022-02-22)


### Features

* Add missing Socket properties ([7c94304](https://github.com/Rapsssito/react-native-tcp-socket/commit/7c943045f0564e3d848dfc21de49b1c8952ac7f9))

# [5.5.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v5.4.0...v5.5.0) (2021-10-26)


### Features

* Add isIP & isIPv4 & isIPv6 methods ([#133](https://github.com/Rapsssito/react-native-tcp-socket/issues/133)) ([5498814](https://github.com/Rapsssito/react-native-tcp-socket/commit/5498814022272385ee8e2492f998c58d12773a43))

# [5.4.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v5.3.1...v5.4.0) (2021-10-26)


### Features

* Publish Socket timeout property ([#131](https://github.com/Rapsssito/react-native-tcp-socket/issues/131)) ([b87a282](https://github.com/Rapsssito/react-native-tcp-socket/commit/b87a2827ecf11aad8deff4ae9e3b45567d57b580))

## [5.3.1](https://github.com/Rapsssito/react-native-tcp-socket/compare/v5.3.0...v5.3.1) (2021-09-13)


### Bug Fixes

* Fix Gradle 7 compatibility ([#126](https://github.com/Rapsssito/react-native-tcp-socket/issues/126)) ([14fdab8](https://github.com/Rapsssito/react-native-tcp-socket/commit/14fdab88906ab0f865cdb126be4989c42c82bfdd))

# [5.3.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v5.2.1...v5.3.0) (2021-08-27)


### Features

* Implement backpressure handling ([#115](https://github.com/Rapsssito/react-native-tcp-socket/issues/115)) ([8a90f32](https://github.com/Rapsssito/react-native-tcp-socket/commit/8a90f32077417f0a2bb9d349470d078366e4fc6c))

## [5.2.1](https://github.com/Rapsssito/react-native-tcp-socket/compare/v5.2.0...v5.2.1) (2021-06-09)


### Bug Fixes

* **Android:** Fix remoteAddress not returning IP ([#111](https://github.com/Rapsssito/react-native-tcp-socket/issues/111)) ([cd3759a](https://github.com/Rapsssito/react-native-tcp-socket/commit/cd3759a908e5c42b8e92dde97324a7b9c07bc90b))

# [5.2.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v5.1.0...v5.2.0) (2021-03-12)


### Features

* Export Socket class ([#104](https://github.com/Rapsssito/react-native-tcp-socket/issues/104)) ([72db5fa](https://github.com/Rapsssito/react-native-tcp-socket/commit/72db5faef44e586c0d9fcc4752f13d17caba46cf))

# [5.1.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v5.0.0...v5.1.0) (2021-03-06)


### Features

* Export Server class ([#101](https://github.com/Rapsssito/react-native-tcp-socket/issues/101)) ([a1e983b](https://github.com/Rapsssito/react-native-tcp-socket/commit/a1e983b62bdc9f1320809cfda623609a9cb8a8ec))

# [5.0.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v4.5.7...v5.0.0) (2021-02-26)


### Features

* Add socket address properties ([#94](https://github.com/Rapsssito/react-native-tcp-socket/issues/94)) ([1658831](https://github.com/Rapsssito/react-native-tcp-socket/commit/1658831bad5696c776577fc85572c04d300008f4))


### BREAKING CHANGES

* Events types and callbacks now match NodeJS official API.

## [4.5.7](https://github.com/Rapsssito/react-native-tcp-socket/compare/v4.5.6...v4.5.7) (2021-02-26)


### Bug Fixes

* Add 'homepage' to podspect ([0d631df](https://github.com/Rapsssito/react-native-tcp-socket/commit/0d631df784f736d6284d442db7c462a725826b59)), closes [#98](https://github.com/Rapsssito/react-native-tcp-socket/issues/98)

## [4.5.6](https://github.com/Rapsssito/react-native-tcp-socket/compare/v4.5.5...v4.5.6) (2021-02-25)


### Bug Fixes

* Fix podspec version ([f808cfe](https://github.com/Rapsssito/react-native-tcp-socket/commit/f808cfe83a446382ea483f0892518f0b2e62f5ea)), closes [#97](https://github.com/Rapsssito/react-native-tcp-socket/issues/97)

## [4.5.5](https://github.com/Rapsssito/react-native-tcp-socket/compare/v4.5.4...v4.5.5) (2020-12-23)


### Bug Fixes

* Update TypeScript declaration files ([b55a260](https://github.com/Rapsssito/react-native-tcp-socket/commit/b55a260119d3f74ed1aeb6448e2afea9452b4a29))

## [4.5.4](https://github.com/Rapsssito/react-native-tcp-socket/compare/v4.5.3...v4.5.4) (2020-10-14)


### Bug Fixes

* Add ref() & unref() as empty methods ([#84](https://github.com/Rapsssito/react-native-tcp-socket/issues/84)) ([1ee98a4](https://github.com/Rapsssito/react-native-tcp-socket/commit/1ee98a482f2d12c9a26216eda02421ba225c109c))

## [4.5.3](https://github.com/Rapsssito/react-native-tcp-socket/compare/v4.5.2...v4.5.3) (2020-10-02)


### Bug Fixes

* **Android:** Report correct port, even when automatically allocated ([#82](https://github.com/Rapsssito/react-native-tcp-socket/issues/82)) ([6cae377](https://github.com/Rapsssito/react-native-tcp-socket/commit/6cae377eb25cd6539f479760e31e37363fb9c060))

## [4.5.2](https://github.com/Rapsssito/react-native-tcp-socket/compare/v4.5.1...v4.5.2) (2020-10-01)


### Bug Fixes

* Fix Xcode 12 compatibility ([f0f81f8](https://github.com/Rapsssito/react-native-tcp-socket/commit/f0f81f8cf3309d1a7fc46cc5f072c0de6d22a5a9)), closes [facebook/react-native#29633](https://github.com/facebook/react-native/issues/29633)

## [4.5.1](https://github.com/Rapsssito/react-native-tcp-socket/compare/v4.5.0...v4.5.1) (2020-09-12)


### Bug Fixes

* Fix TCPServer documentation ([d0dcd5b](https://github.com/Rapsssito/react-native-tcp-socket/commit/d0dcd5b29d2aa382441d88be52e7b8f9d1c21d26)), closes [#79](https://github.com/Rapsssito/react-native-tcp-socket/issues/79) [#57](https://github.com/Rapsssito/react-native-tcp-socket/issues/57)

# [4.5.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v4.4.0...v4.5.0) (2020-08-30)


### Features

* Add v.1.4.0 compatibility version ([31eff17](https://github.com/Rapsssito/react-native-tcp-socket/commit/31eff17c8f93c3a7dff8bf44d84a825941f5f07b))

# [4.4.0](https://github.com/Rapsssito/react-native-tcp-socket/compare/v4.3.1...v4.4.0) (2020-08-30)


### Features

* Extend compatibility to RN 0.60.0 ([#75](https://github.com/Rapsssito/react-native-tcp-socket/issues/75)) ([5c1cd79](https://github.com/Rapsssito/react-native-tcp-socket/commit/5c1cd79ad1dcc5115f5a0042f0ec6dc4107e66f7))

## [4.3.1](https://github.com/Rapsssito/react-native-tcp-socket/compare/v4.3.0...v4.3.1) (2020-08-24)


### Bug Fixes

* **Android:** Bump API to 29 ([edc8518](https://github.com/Rapsssito/react-native-tcp-socket/commit/edc851893ebcbadf748d25b0a03e81130e08ce97))

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
