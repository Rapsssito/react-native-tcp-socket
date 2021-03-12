# react-native-tcp-socket <!-- omit in toc -->
<p align="center">
  <img src="https://github.com/Rapsssito/react-native-tcp-socket/workflows/tests/badge.svg" />
  <img src="https://img.shields.io/npm/dw/react-native-tcp-socket" />
  <img src="https://img.shields.io/npm/v/react-native-tcp-socket?color=gr&label=npm%20version" />
<p/>

React Native TCP socket API for Android & iOS with **client SSL/TLS support**. It allows you to create TCP clients and servers sockets, imitating Node's [net](https://nodejs.org/api/net.html) API functionalities (check the available [API](#api) for more information).

## Table of Contents <!-- omit in toc -->

- [Getting started](#getting-started)
    - [Overriding `net`](#overriding-net)
    - [Using React Native >= 0.60](#using-react-native--060)
    - [Self-Signed SSL (only available for React Native > 0.60)](#self-signed-ssl-only-available-for-react-native--060)
    - [Using React Native < 0.60](#using-react-native--060-1)
- [React Native Compatibility](#react-native-compatibility)
- [Usage](#usage)
  - [Client](#client)
  - [Server](#server)
  - [SSL Client](#ssl-client)
- [API](#api)
  - [TcpSocket](#tcpsocket)
    - [`createConnection()`](#createconnection)
  - [Server](#server-1)
    - [`listen()`](#listen)
- [Maintainers](#maintainers)
- [Acknowledgments](#acknowledgments)
- [License](#license)

## Getting started
Install the library using either Yarn:

```
yarn add react-native-tcp-socket
```

or npm:

```
npm install --save react-native-tcp-socket
```

#### Overriding `net`
Since `react-native-tcp-socket` offers the same API as Node's net, in case you want to import this module as `net` or use `require('net')` in your JavaScript, you must add the following lines to your `package.json` file.

```json
{
  "react-native": {
    "net": "react-native-tcp-socket"
  }
}
```

In addition, in order to obtain the TS types (or autocompletion) provided by this module, you must also add the following to your custom declarations file.

```ts
...
declare module 'net' {
    import TcpSockets from 'react-native-tcp-socket';
    export = TcpSockets;
}
```

If you want to avoid duplicated `net` types, make sure not to use the default `node_modules/@types` in your `tsconfig.json` `"typeRoots"` property.

_Check the [example app](./examples/tcpsockets/) provided for a working example._


#### Using React Native >= 0.60
Linking the package manually is not required anymore with [Autolinking](https://github.com/react-native-community/cli/blob/master/docs/autolinking.md).

- **iOS Platform:**

  `$ cd ios && pod install && cd ..` # CocoaPods on iOS needs this extra step

- **Android Platform:**

  Modify your **`android/build.gradle`** configuration to match `minSdkVersion = 21`:
  ```
  buildscript {
    ext {
      ...
      minSdkVersion = 21
      ...
    }
  ```

#### Self-Signed SSL (only available for React Native > 0.60)
You will need a [metro.config.js](https://facebook.github.io/metro/docs/en/configuration.html) file in order to use a self-signed SSL certificate. You should already have this file in your root project directory, but if you don't, create it.
Inside a `module.exports` object, create a key called `resolver` with another object called `assetExts`. The value of `assetExts` should be an array of the resource file extensions you want to support.

If you want to support `.pem` files (plus all the already supported files), your `metro.config.js` would like like this:
```javascript
const {getDefaultConfig} = require('metro-config');
const defaultConfig = getDefaultConfig.getDefaultValues(__dirname);

module.exports = {
  resolver: {
    assetExts: [...defaultConfig.resolver.assetExts, 'pem'],
  },
  // ...
};
```

  
#### Using React Native < 0.60

You then need to link the native parts of the library for the platforms you are using. The easiest way to link the library is using the CLI tool by running this command from the root of your project:

`$ react-native link react-native-tcp-socket`

If you can't or don't want to use the CLI tool, you can also manually link the library using the instructions below (click on the arrow to show them):

<details>
<summary>Manually link the library on iOS</summary>

1. In XCode, in the project navigator, right click `Libraries` ➜ `Add Files to [your project's name]`
2. Go to `node_modules` ➜ `react-native-tcp-socket` and add `TcpSockets.xcodeproj`
3. In XCode, in the project navigator, select your project. Add `libTcpSockets.a` to your project's `Build Phases` ➜ `Link Binary With Libraries`
4. Run your project (`Cmd+R`)<
</details>

<details>
<summary>Manually link the library on Android</summary>

1. Open up `android/app/src/main/java/[...]/MainApplication.java`
  - Add `import com.asterinet.react.tcpsocket.TcpSocketPackage;` to the imports at the top of the file
  - Add `new TcpSocketPackage()` to the list returned by the `getPackages()` method
2. Append the following lines to `android/settings.gradle`:
  	```
  	include ':react-native-tcp-socket'
  	project(':react-native-tcp-socket').projectDir = new File(rootProject.projectDir, 	'../node_modules/react-native-tcp-socket/android')
  	```
3. Insert the following lines inside the dependencies block in `android/app/build.gradle`:
  	```
      implementation project(':react-native-tcp-socket')
  	```
</details>

## React Native Compatibility
To use this library you need to ensure you are using the correct version of React Native. If you are using a version of React Native that is lower than `0.60` you will need to upgrade before attempting to use this library latest version.

| `react-native-tcp-socket` version         | Required React Native Version                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `4.X.X`, `3.X.X`                          | `>= 0.60.0`                                                                         |
| `1.4.0`                                   | `>= Unknown`                                                                      |

## Usage
Import the library:
```javascript
import TcpSocket from 'react-native-tcp-socket';
// const net = require('react-native-tcp-socket');
```
### Client
```javascript
// Create socket
const client = TcpSocket.createConnection(options, () => {
  // Write on the socket
  client.write('Hello server!');

  // Close socket
  client.destroy();
});

client.on('data', function(data) {
  console.log('message was received', data);
});

client.on('error', function(error) {
  console.log(error);
});

client.on('close', function(){
  console.log('Connection closed!');
});
```

### Server
```javascript
const server = TcpSocket.createServer(function(socket) {
  socket.on('data', (data) => {
    socket.write('Echo server ' + data);
  });

  socket.on('error', (error) => {
    console.log('An error ocurred with client socket ', error);
  });

  socket.on('close', (error) => {
    console.log('Closed connection with ', socket.address());
  });
}).listen({ port: 12345, host: '0.0.0.0' });

server.on('error', (error) => {
  console.log('An error ocurred with the server', error);
});

server.on('close', () => {
  console.log('Server closed connection');
});
```

### SSL Client
```javascript
const client = TcpSocket.createConnection({
    port: 8443,
    host: "example.com",
    tls: true,
    // tlsCheckValidity: false, // Disable validity checking
    // tlsCert: require('./selfmade.pem') // Self-signed certificate
});

// ...
```
_Note: In order to use self-signed certificates make sure to [update your metro.config.js configuration](#self-signed-ssl-only-available-for-react-native--060)._

## API
Here are listed all methods implemented in `react-native-tcp-socket`, their functionalities are equivalent to those provided by Node's [net](https://nodejs.org/api/net.html) (more info on [#41](https://github.com/Rapsssito/react-native-tcp-socket/issues/41)). However, the **methods whose interface differs from Node are marked in bold**.

### TcpSocket
* **Methods:**
  * **[`TcpSocket.createConnection(options[, callback])`](#createconnection)**
  * [`address()`](https://nodejs.org/api/net.html#net_socket_address)
  * [`destroy([error])`](https://nodejs.org/api/net.html#net_socket_destroy_error)
  * [`end([data][, encoding][, callback])`](https://nodejs.org/api/net.html#net_socket_end_data_encoding_callback)
  * [`setEncoding([encoding])`](https://nodejs.org/api/net.html#net_socket_setencoding_encoding)
  * [`setKeepAlive([enable][, initialDelay])`](https://nodejs.org/api/net.html#net_socket_setkeepalive_enable_initialdelay) - _`initialDelay` is ignored_
  * [`setNoDelay([noDelay])`](https://nodejs.org/api/net.html#net_socket_setnodelay_nodelay)
  * [`setTimeout(timeout[, callback])`](https://nodejs.org/api/net.html#net_socket_settimeout_timeout_callback)
  * [`write(data[, encoding][, callback])`](https://nodejs.org/api/net.html#net_socket_write_data_encoding_callback)
* **Properties:**
  * [`remoteAddress`](https://nodejs.org/api/net.html#net_socket_remoteaddress)
  * [`remoteFamily`](https://nodejs.org/api/net.html#net_socket_remotefamily)
  * [`remotePort`](https://nodejs.org/api/net.html#net_socket_remoteport)
  * [`localAddress`](https://nodejs.org/api/net.html#net_socket_localaddress)
  * [`localPort`](https://nodejs.org/api/net.html#net_socket_localport)
* **Events:**
  * [`'close'`](https://nodejs.org/api/net.html#net_event_close_1)
  * [`'connect'`](https://nodejs.org/api/net.html#net_event_connect)
  * [`'data'`](https://nodejs.org/api/net.html#net_event_data)
  * [`'error'`](https://nodejs.org/api/net.html#net_event_error_1)

#### `createConnection()`
`createConnection(options[, callback])` creates a TCP connection using the given [`options`](#createconnection-options).
##### `createConnection: options` <!-- omit in toc -->
**Required**. Available options for creating a socket. It must be an `object` with the following properties:

| Property              | Type   | iOS  | Android |Description                                                                                        |
| --------------------- | ------ | :--: | :-----: |-------------------------------------------------------------------------------------------------- |
| **`port`** | `<number>` | ✅  |   ✅   | **Required**. Port the socket should connect to. |
| `host` | `<string>` | ✅  |   ✅  | Host the socket should connect to. IP address in IPv4 format or `'localhost'`. **Default**: `'localhost'`. |
| `timeout` | `<number>` | ✅  |   ✅  | If set, will be used to call [`setTimeout(timeout)`](https://nodejs.org/api/net.html#net_socket_settimeout_timeout_callback) after the socket is created, but before it starts the connection. |
| `localAddress` | `<string>` | ✅  |   ✅  | Local address the socket should connect from. If not specified, the OS will decide. It is **highly recommended** to specify a `localAddress` to prevent overload errors and improve performance. |
| `localPort` | `<number>` | ✅  |   ✅  | Local port the socket should connect from. If not specified, the OS will decide. |
| `interface`| `<string>` | ❌  |   ✅  | Interface the socket should connect from. If not specified, it will use the current active connection. The options are: `'wifi', 'ethernet', 'cellular'`. |
| `reuseAddress`| `<boolean>` | ❌  |   ✅  | Enable/disable the reuseAddress socket option. **Default**: `true`. |
| `tls`| `<boolean>` | ✅  |   ✅  | Enable/disable SSL/TLS socket creation. **Default**: `false`. |
| `tlsCheckValidity`| `<boolean>` | ✅  |   ✅  | Enable/disable SSL/TLS certificate validity check. **Default**: `true`. |
| `tlsCert`| `<any>` | ✅  |   ✅  | CA file (.pem format) to trust. If `null`, it will use the device's default SSL trusted list. Useful for self-signed certificates. _See [example](#ssl-client) for more info_. **Default**: `null`. |

**Note**: The platforms marked as ❌ use the default value.

### Server
* **Methods:**
  * [`TcpSocket.createServer(connectionListener)`](https://nodejs.org/api/net.html#net_net_createserver_options_connectionlistener)
  * [`address()`](https://nodejs.org/api/net.html#net_server_address)
  * **[`listen(options[, callback])`](#listen)**
  * [`close([callback])`](https://nodejs.org/api/net.html#net_server_close_callback)
  * [`getConnections(callback)`](https://nodejs.org/api/net.html#net_server_getconnections_callback)
* **Properties:**
  * [`listening`](https://nodejs.org/api/net.html#net_server_listening)
* **Events:**
  * [`'close'`](https://nodejs.org/api/net.html#net_event_close)
  * [`'connection'`](https://nodejs.org/api/net.html#net_event_connection)
  * [`'error'`](https://nodejs.org/api/net.html#net_event_error)
  * [`'listening'`](https://nodejs.org/api/net.html#net_event_listening)

#### `listen()`
`listen(options[, callback])` creates a TCP server socket using the given [`options`](#listen-options).

##### `listen: options` <!-- omit in toc -->
**Required**. Available options for creating a server socket. It must be an `object` with the following properties:

| Property              | Type   | iOS  | Android |Description                                                                                        |
| --------------------- | ------ | :--: | :-----: |-------------------------------------------------------------------------------------------------- |
| **`port`** | `<number>`  | ✅  |   ✅    | **Required**. Port the socket should listen to. |
| `host` | `<string>` | ✅  |   ✅    | Host the socket should listen to. IP address in IPv4 format or `'localhost'`. **Default**: `'0.0.0.0'`. |
| `reuseAddress`| `<boolean>` | ❌  |   ✅    | Enable/disable the reuseAddress socket option. **Default**: `true`. |

**Note**: The platforms marked as ❌ use the default value.

## Maintainers

* [Rapsssito](https://github.com/rapsssito)

## Acknowledgments

* iOS part originally forked from @aprock [react-native-tcp](https://github.com/aprock/react-native-tcp)
* [react-native-udp](https://github.com/tradle/react-native-udp)

## License

The library is released under the MIT license. For more information see [`LICENSE`](/LICENSE).
