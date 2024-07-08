# react-native-tcp-socket <!-- omit in toc -->
<p align="center">
  <img src="https://github.com/Rapsssito/react-native-tcp-socket/workflows/tests/badge.svg" />
  <img src="https://img.shields.io/npm/dw/react-native-tcp-socket" />
  <img src="https://img.shields.io/npm/v/react-native-tcp-socket?color=gr&label=npm%20version" />
<p/>

React Native TCP socket API for Android, iOS & macOS with **SSL/TLS support**. It allows you to create TCP client and server sockets, imitating Node's [net](https://nodejs.org/api/net.html) and Node's [tls](https://nodejs.org/api/tls.html) API functionalities (check the available [API](#api) for more information).

## Table of Contents <!-- omit in toc -->

- [Getting started](#getting-started)
    - [Overriding `net`](#overriding-net)
    - [Overriding `tls`](#overriding-tls)
    - [Using React Native \>= 0.60](#using-react-native--060)
    - [Self-Signed SSL (only available for React Native \> 0.60)](#self-signed-ssl-only-available-for-react-native--060)
    - [Using React Native \< 0.60](#using-react-native--060-1)
- [React Native Compatibility](#react-native-compatibility)
- [Usage](#usage)
  - [Client example](#client-example)
  - [Server example](#server-example)
  - [TLS Client example](#tls-client-example)
  - [TLS Server example](#tls-server-example)
- [API](#api)
  - [net](#net)
    - [Socket](#socket)
    - [Server](#server)
  - [tls](#tls)
    - [TLSSocket](#tlssocket)
    - [TLSServer](#tlsserver)
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

#### Overriding `tls`
The same applies to `tls` module. However, you should be aware of the following:

* The `Server` class exported by default is non-TLS. In order to use the TLS server, you must use the `TLSServer` class. You may override the default `Server` class (`tls.Server = tls.TLSServer`). The same goes with the `createServer()` and `connect()`. In order to use the TLS methods, you must use the `createTLSServer()` and `connectTLS()` methods respectively. You may override the default methods (`tls.createServer = tls.createTLSServer` and `tls.connect = tls.connectTLS`).
* Node's `tls` module requires the keys and certificates to be provided as a string. However, the `react-native-tcp-socket` module requires them to be imported with `require()`.

In addition, in order to obtain the TS types (or autocompletion) provided by this module, you must also add the following to your custom declarations file.

```ts
...
declare module 'tls' {
    import TcpSockets from 'react-native-tcp-socket';
    export const Server = TcpSockets.TLSServer;
    export const TLSSocket = TcpSockets.TLSSocket;
    export const connect = TcpSockets.connectTLS;
    export const createServer = TcpSockets.createTLSServer;
}
```

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
In order to generate the required files (keys and certificates) for self-signed SSL, you can use the following command:
```
openssl genrsa -out server-key.pem 4096
openssl req -new -key server-key.pem -out server-csr.pem
openssl x509 -req -in server-csr.pem -signkey server-key.pem -out server-cert.pem
openssl pkcs12 -export -out server-keystore.p12 -inkey server-key.pem -in server-cert.pem
```
__Note:__ The `server-keystore.p12` must not have a password.

You will need a [metro.config.js](https://facebook.github.io/metro/docs/en/configuration.html) file in order to use a self-signed SSL certificate. You should already have this file in your root project directory, but if you don't, create it.
Inside a `module.exports` object, create a key called `resolver` with another object called `assetExts`. The value of `assetExts` should be an array of the resource file extensions you want to support.

If you want to be able to use `.pem` and `.p12` files (plus all the already supported files), your `metro.config.js` should look like this:
```javascript
const {getDefaultConfig} = require('metro-config');
const defaultConfig = getDefaultConfig.getDefaultValues(__dirname);

module.exports = {
  resolver: {
    assetExts: [...defaultConfig.resolver.assetExts, 'pem', 'p12'],
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
To use this library you need to ensure you are using the correct version of React Native. If you are using a version of React Native that is lower than `0.60` you will need to upgrade before attempting to use the latest version.

| `react-native-tcp-socket` version  | Required React Native Version |
| ---------------------------------- | ----------------------------- |
| `6.X.X`, `5.X.X`, `4.X.X`, `3.X.X` | `>= 0.60.0`                   |
| `1.4.0`                            | `>= Unknown`                  |

## Usage
Import the library:
```javascript
import TcpSocket from 'react-native-tcp-socket';
// const net = require('react-native-tcp-socket');
// const tls = require('react-native-tcp-socket');
```
### Client example
```javascript
const options = {
  port: port,
  host: '127.0.0.1',
  localAddress: '127.0.0.1',
  reuseAddress: true,
  // localPort: 20000,
  // interface: "wifi",
};

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

### Server example
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

### TLS Client example
```javascript
const options = {
  port: port,
  host: '127.0.0.1',
  localAddress: '127.0.0.1',
  reuseAddress: true,
  // localPort: 20000,
  // interface: "wifi",
  ca: require('server-cert.pem'),
};

// Create socket
const client = TcpSocket.connectTLS(options, () => {
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

### TLS Server example
```javascript
const options = {
  keystore: require('server-keystore.p12'),
};


const server = TcpSocket.createTLSServer(options, function(socket) {
  socket.on('data', (data) => {
    socket.write('Echo server ' + data);
  });

  socket.on('error', (error) => {
    console.log('An error ocurred with SSL client socket ', error);
  });

  socket.on('close', (error) => {
    console.log('SSL closed connection with ', socket.address());
  });
}).listen({ port: 12345, host: '0.0.0.0' });

server.on('error', (error) => {
  console.log('An error ocurred with the server', error);
});

server.on('close', () => {
  console.log('Server closed connection');
});
```

_Note: In order to use self-signed certificates make sure to [update your metro.config.js configuration](#self-signed-ssl-only-available-for-react-native--060)._

## API
### net
Here are listed all methods implemented in `react-native-tcp-socket` that imitate Node's [net](https://nodejs.org/api/net.html) API, their functionalities are equivalent to those provided by Node's [net](https://nodejs.org/api/net.html) (more info on [#41](https://github.com/Rapsssito/react-native-tcp-socket/issues/41)). However, the **methods whose interface differs from Node are marked in bold**.

* **[`net.connect(options[, callback])`](#netcreateconnection----omit-in-toc)**
* **[`net.createConnection(options[, callback])`](#netcreateconnection----omit-in-toc)**
* [`net.createServer(connectionListener)`](https://nodejs.org/api/net.html#net_net_createserver_options_connectionlistener)
* [`net.isIP(input)`](https://nodejs.org/api/net.html#netisipinput)
* [`net.isIPv4(input)`](https://nodejs.org/api/net.html#netisipv4input)
* [`net.isIPv6(input)`](https://nodejs.org/api/net.html#netisipv6input)

#### Socket
* **Methods:**
  * [`address()`](https://nodejs.org/api/net.html#net_socket_address)
  * [`destroy([error])`](https://nodejs.org/api/net.html#net_socket_destroy_error)
  * [`end([data][, encoding][, callback])`](https://nodejs.org/api/net.html#net_socket_end_data_encoding_callback)
  * [`setEncoding([encoding])`](https://nodejs.org/api/net.html#net_socket_setencoding_encoding)
  * [`setKeepAlive([enable][, initialDelay])`](https://nodejs.org/api/net.html#net_socket_setkeepalive_enable_initialdelay) - _`initialDelay` is ignored_
  * [`setNoDelay([noDelay])`](https://nodejs.org/api/net.html#net_socket_setnodelay_nodelay)
  * [`setTimeout(timeout[, callback])`](https://nodejs.org/api/net.html#net_socket_settimeout_timeout_callback)
  * [`write(data[, encoding][, callback])`](https://nodejs.org/api/net.html#net_socket_write_data_encoding_callback)
  * [`pause()`](https://nodejs.org/api/net.html#net_socket_pause)
  * `ref()` - _Will not have any effect_
  * [`resume()`](https://nodejs.org/api/net.html#net_socket_resume)
  * `unref()` - _Will not have any effect_
* **Properties:**
  * Inherited from [`Stream.Writable`](https://nodejs.org/api/stream.html#stream_class_stream_writable):
    * [`writableNeedDrain`](https://nodejs.org/api/stream.html#stream_writable_writableneeddrain)
  * [`bytesRead`](https://nodejs.org/api/net.html#socketbytesread)
  * [`bytesWritten`](https://nodejs.org/api/net.html#socketbyteswritten)
  * [`connecting`](https://nodejs.org/api/net.html#socketconnecting)
  * [`destroyed`](https://nodejs.org/api/net.html#socketdestroyed)
  * [`localAddress`](https://nodejs.org/api/net.html#net_socket_localaddress)
  * [`localPort`](https://nodejs.org/api/net.html#net_socket_localport)
  * [`remoteAddress`](https://nodejs.org/api/net.html#net_socket_remoteaddress)
  * [`remoteFamily`](https://nodejs.org/api/net.html#net_socket_remotefamily)
  * [`remotePort`](https://nodejs.org/api/net.html#net_socket_remoteport)
  * [`pending`](https://nodejs.org/api/net.html#socketpending)
  * [`timeout`](https://nodejs.org/api/net.html#sockettimeout)
  * [`readyState`](https://nodejs.org/api/net.html#socketreadystate)
* **Events:**
  * Inherited from [`Stream.Readable`](https://nodejs.org/api/stream.html#stream_class_stream_readable):
    * [`'pause'`](https://nodejs.org/api/stream.html#stream_event_pause)
    * [`'resume'`](https://nodejs.org/api/stream.html#stream_event_resume)
  * [`'close'`](https://nodejs.org/api/net.html#net_event_close_1)
  * [`'connect'`](https://nodejs.org/api/net.html#net_event_connect)
  * [`'data'`](https://nodejs.org/api/net.html#net_event_data)
  * [`'drain'`](https://nodejs.org/api/net.html#net_event_drain)
  * [`'error'`](https://nodejs.org/api/net.html#net_event_error_1)
  * [`'timeout'`](https://nodejs.org/api/net.html#net_event_timeout)

##### `net.createConnection()` <!-- omit in toc -->
`net.createConnection(options[, callback])` creates a TCP connection using the given `options`. The `options` parameter must be an `object` with the following properties:

| Property       | Type        | iOS/macOS | Android | Description                                                                                                                                                                                      |
| -------------- | ----------- | :-------: | :-----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`port`**     | `<number>`  |     ✅     |    ✅    | **Required**. Port the socket should connect to.                                                                                                                                                 |
| `host`         | `<string>`  |     ✅     |    ✅    | Host the socket should connect to. IP address in IPv4 format or `'localhost'`. **Default**: `'localhost'`.                                                                                       |
| `localAddress` | `<string>`  |     ✅     |    ✅    | Local address the socket should connect from. If not specified, the OS will decide. It is **highly recommended** to specify a `localAddress` to prevent overload errors and improve performance. |
| `localPort`    | `<number>`  |     ✅     |    ✅    | Local port the socket should connect from. If not specified, the OS will decide.                                                                                                                 |
| `interface`    | `<string>`  |     ❌     |    ✅    | Interface the socket should connect from. If not specified, it will use the current active connection. The options are: `'wifi', 'ethernet', 'cellular'`.                                        |
| `reuseAddress` | `<boolean>` |     ❌     |    ✅    | Enable/disable the reuseAddress socket option. **Default**: `true`.                                                                                                                              |

**Note**: The platforms marked as ❌ use the default value.

#### Server
* **Methods:**
  * [`address()`](https://nodejs.org/api/net.html#net_server_address)
  * **[`listen(options[, callback])`](#serverlisten----omit-in-toc)**
  * [`close([callback])`](https://nodejs.org/api/net.html#net_server_close_callback)
  * [`getConnections(callback)`](https://nodejs.org/api/net.html#net_server_getconnections_callback)
* **Properties:**
  * [`listening`](https://nodejs.org/api/net.html#net_server_listening)
* **Events:**
  * [`'close'`](https://nodejs.org/api/net.html#net_event_close)
  * [`'connection'`](https://nodejs.org/api/net.html#net_event_connection)
  * [`'error'`](https://nodejs.org/api/net.html#net_event_error)
  * [`'listening'`](https://nodejs.org/api/net.html#net_event_listening)

##### `Server.listen()` <!-- omit in toc -->
`Server.listen(options[, callback])` creates a TCP server socket using the given `options`. The `options` parameter must be an `object` with the following properties:

| Property       | Type        | iOS/macOS | Android | Description                                                                                             |
| -------------- | ----------- | :-------: | :-----: | ------------------------------------------------------------------------------------------------------- |
| **`port`**     | `<number>`  |     ✅     |    ✅    | **Required**. Port the socket should listen to.                                                         |
| `host`         | `<string>`  |     ✅     |    ✅    | Host the socket should listen to. IP address in IPv4 format or `'localhost'`. **Default**: `'0.0.0.0'`. |
| `reuseAddress` | `<boolean>` |     ❌     |    ✅    | Enable/disable the reuseAddress socket option. **Default**: `true`.                                     |

**Note**: The platforms marked as ❌ use the default value.

### tls
Here are listed all methods implemented in `react-native-tcp-socket` that imitate Node's [tls](https://nodejs.org/api/tls.html) API, their functionalities are equivalent to those provided by Node's [tls](https://nodejs.org/api/tls.html). However, the **methods whose interface differs from Node are marked in bold**.

* **[`tls.connectTLS(options[, callback])`](#tlsconnecttls----omit-in-toc)**
* **[`tls.createTLSServer([options][, secureConnectionListener])`](#tlscreatetlsserver----omit-in-toc)**

#### TLSSocket
* **Methods:**
  * All methods from [`Socket`](#socket)
  * [`getCertificate()`](https://nodejs.org/api/tls.html#tlssocketgetcertificate) _Android only_
  * **[`getPeerCertificate()`](https://nodejs.org/api/tls.html#tlssocketgetpeercertificatedetailed)** _Android only_
* **Properties:**
  * All properties from [`Socket`](#socket)
* **Events:**
  * All events from [`Socket`](#socket)
  * [`'secureConnect'`](https://nodejs.org/api/tls.html#event-secureconnect)

##### `tls.connectTLS()` <!-- omit in toc -->
`tls.connectTLS(options[, callback])` creates a TLS socket connection using the given `options`. The `options` parameter must be an `object` with the following properties:

| Property          | Type       | iOS/macOS | Android | Description                                                                                                                                                                                                                                                          |
| ----------------- | ---------- | :-------: | :-----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ca`              | `<import>` |     ✅     |    ✅    | CA file (.pem format) to trust. If `null`, it will use the device's default SSL trusted list. Useful for self-signed certificates. _Check the [documentation](#self-signed-ssl-only-available-for-react-native--060) for generating such file_. **Default**: `null`. |
| `key`             | `<import>` |     ❌     |    ✅    | Private key file (.pem format). _Check the [documentation](#self-signed-ssl-only-available-for-react-native--060) for generating such file_.                                                                                                                         |
| `cert`            | `<import>` |     ❌     |    ✅    | Public certificate file (.pem format). _Check the [documentation](#self-signed-ssl-only-available-for-react-native--060) for generating such file_.                                                                                                                  |
| `androidKeyStore` | `<string>` |     ❌     |    ✅    | Android KeyStore alias.                                                                                                                                                                                                                                              |
| `certAlias`       | `<string>` |     ❌     |    ✅    | Android KeyStore certificate alias.                                                                                                                                                                                                                                  |
| `keyAlias`        | `<string>` |     ❌     |    ✅    | Android KeyStore private key alias.                                                                                                                                                                                                                                  |
| `...`             | `<any>`    |     ✅     |    ✅    | Any other [`socket.connect()`](#netcreateconnection----omit-in-toc) options not already listed.                                                                                                                                                                      |

#### TLSServer
__Note__: The TLS server is named `Server` in Node's tls, but it is named `TLSServer` in `react-native-tcp-socket` in order to avoid confusion with the [`Server`](#server) class.
* **Methods:**
  * All methods from [`Server`](#server)
  * **[`setSecureContext(options)`](#tlscreatetlsserver----omit-in-toc)**
* **Properties:**
  * All properties from [`Server`](#server)
* **Events:**
  * All events from [`Server`](#server)
  * [`'secureConnection'`](https://nodejs.org/api/tls.html#event-secureconnection)

##### `tls.createTLSServer()` <!-- omit in toc -->
`tls.createTLSServer([options][, secureConnectionListener])` creates a new `tls.TLSServer`. The `secureConnectionListener`, if provided, is automatically set as a listener for the `'secureConnection'` event. The `options` parameter must be an `object` with the following properties:

| Property       | Type       | iOS/macOS | Android | Description                                                                                                                                                                                         |
| -------------- | ---------- | :-------: | :-----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`keystore`** | `<import>` |     ✅     |    ✅    | **Required**. Key store in PKCS#12 format with the server certificate and private key. _Check the [documentation](#self-signed-ssl-only-available-for-react-native--060) for generating such file_. |

## Maintainers

* [Rapsssito](https://github.com/rapsssito)

## Acknowledgments

* iOS part originally forked from @aprock [react-native-tcp](https://github.com/aprock/react-native-tcp)
* [react-native-udp](https://github.com/tradle/react-native-udp)

## License

The library is released under the MIT license. For more information see [`LICENSE`](/LICENSE).
