# react-native-tcp-socket
React Native TCP socket API for Android & iOS. It allows you to create TCP clients and servers sockets, simulating node's [net](https://nodejs.org/api/net.html) API.

## Table of Contents

- [Getting started](#getting-started)
- [Compatibility](#react-native-compatibility)
- [Usage](#usage)
- [API](#icon-component)
  - [Client](#client)
  - [Server](#server)
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

  Modify your **`android/app/src/main/AndroidManifest.xml`** and add the following:
  ```
    <uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />
  ```
  
  
#### Using React Native < 0.60

You then need to link the native parts of the library for the platforms you are using. The easiest way to link the library is using the CLI tool by running this command from the root of your project:

`$ react-native link react-native-tcp-socket`

If you can't or don't want to use the CLI tool, you can also manually link the library using the instructions below (click on the arrow to show them):

<details>
<summary>Manually link the library on iOS</summary>

1. In XCode, in the project navigator, right click `Libraries` ➜ `Add Files to [your project's name]`
2. Go to `node_modules` ➜ `react-native-tcp-socket` and add `TcpSocket.xcodeproj`
3. In XCode, in the project navigator, select your project. Add `libTcpSocket.a` to your project's `Build Phases` ➜ `Link Binary With Libraries`
4. Run your project (`Cmd+R`)<
</details>

<details>
<summary>Manually link the library on Android</summary>

1. Open up `android/app/src/main/java/[...]/MainApplication.java`
  - Add `import com.reactlibrary.TcpSocketPackage;` to the imports at the top of the file
  - Add `new TcpSocketPackage()` to the list returned by the `getPackages()` method
2. Append the following lines to `android/settings.gradle`:
  	```
  	include ':react-native-tcp-socket'
  	project(':react-native-tcp-socket').projectDir = new File(rootProject.projectDir, 	'../node_modules/react-native-tcp-socket/android')
  	```
3. Insert the following lines inside the dependencies block in `android/app/build.gradle`:
  	```
      compile project(':react-native-tcp-socket')
  	```
</details>

## React Native Compatibility
To use this library you need to ensure you are using the correct version of React Native. If you are using a version of React Native that is lower than `0.61` you will need to upgrade before attempting to use this library latest version.

| `react-native-tcp-socket` version         | Required React Native Version                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `3.x.x`                                   | `>= 0.61`                                                                         |
| `1.2.2`                                   | `>= 0.??`                                                                         |

## Usage
Import the library:
```javascript
import TcpSocket from 'react-native-tcp-socket';
// var net = require('react-native-tcp-socket');
```
### Client
```javascript
// Create socket
var client = TcpSocket.createConnection(options);

client.on('data', function(data) {
  console.log('message was received', data);
});

client.on('error', function(error) {
  console.log(error);
});

client.on('close', function(){
  console.log('Connection closed!');
});

// Write on the socket
client.write("Hello server!");

// Close socket
client.destroy();
```
### Server
```javascript
var server = TcpSocket.createServer(function(socket) {
  socket.on('data', (data) => {
    socket.write('Echo server', data);
  });

  socket.on('error', (error) => {
    console.log('An error ocurred with client socket ', error);
  });

  socket.on('close', (error) => {
    console.log('Closed connection with ', socket.address());
  });
}).listen(12345, '0.0.0.0');

server.on('error', (error) => {
  console.log('An error ocurred with the server', error);
});

server.on('close', () => {
  console.log('Server closed connection');
});
```

## API
### Client
* **Methods:**
  * [`createConnection(options[, callback])`](#createconnection)
  * [`write(data[, encoding][, callback])`](#write)
  * [`destroy()`](#destroy)

#### `createConnection()`
`createConnection(options[, callback])` creates a TCP connection using the given [`options`](#options).
##### `options`
**Required**. Available options for creating a socket. It is an `object` with the following properties:

| Property              | Type                                    | Description                                                                                        |
| --------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **`port`** | `<number>`  | **Required**. Port the socket should connect to. |
| `host` | `<string>` | Host the socket should connect to. IP address in IPv4 format or `"localhost"`. **Default**: `"localhost"`. |
| `reuseAddress`| `<boolean>` | Enable/disable the reuseAddress socket option. **Default**: `false`. |
| `localAddress` | `<string>` | Local address the socket should connect from. If not specified, the OS will decide. It is **highly recommended** to specify a `localAddress` to prevent overload errors and improve performance. |
| `localPort` | `<number>` | Local port the socket should connect from. If not specified, the OS will decide. |
| `interface`| `<string>` | Interface the socket should connect from. If not specified, it will use the current active connection. The options are: `"wifi"`. |

#### `write()`
* `data`: `<string> | <Buffer> | <Uint8Array>`
* `encoding`: `<string>`. Only used when `data` is `string`. Default: `utf8`.
* `callback `: `<Function>`

`write(data[, encoding][, callback])` sends data on the socket. The second parameter specifies the encoding in the case of a string — it defaults to UTF8 encoding.

### Server
* **Methods:**
  * [`createServer(callback)`](#createserver)
  * [`listen(port[, host])`](#listen)
  * [`close()`](#close)

#### `listen()`
`listen(port[, host])` creates a TCP server socket listening on the given port. If the host is not explicity selected, the socket will be bound to `'0.0.0.0'`.

## Maintainers
Looking for maintainers!

* [Rapsssito](https://github.com/rapsssito)

## Acknowledgments

* iOS part originally forked from @aprock [react-native-tcp](https://github.com/aprock/react-native-tcp)
* [react-native-udp](https://github.com/tradle/react-native-udp)

## License

The library is released under the MIT license. For more information see [`LICENSE`](/LICENSE).
