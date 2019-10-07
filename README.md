# react-native-tcp-socket
React Native TCP socket API for Android & iOS. It allows you to create TCP clients and servers sockets, simulating node's [net](https://nodejs.org/api/net.html) API.

# WARNING: THIS LIBRARY IS UNDER DEVELOPMENT
**Working features**
* Android client socket
* iOS client & server sockets (**not tested**)

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

  Modify your **android/build.gradle** configuration to match `minSdkVersion = 21`:
  ```
  buildscript {
    ext {
      ...
      minSdkVersion = 21 
      ...
    }
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
// NOT IMPLEMENTED IN ANDROID
var server = net.createServer(function(socket) {
  socket.write('excellent!');
}).listen(12345);
```
## API
* **Methods:**
  * [`createConnection(options[, callback])`](#createconnection)
  * [`write(data)`](#write)
  * [`destroy()`](#destroy)

### `createConnection()`
Creates a TCP connection using the given `options`.
#### `options`
**Required**. Available options for creating a socket. It is an `object` with the following properties:

| Property              | Type                                    | Description                                                                                        |
| --------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **`host`** | `String` | **Required**. A valid server IP address in IPv4 format or `"localhost"`. |
| **`port`** | `Number`  | **Required**. A valid server port. |
| `[localAddress]` | `String` | A valid local IP address to bind the socket. If not specified, the OS will decide. |
| `[localPort]` | `Number` | A valid local port to bind the socket. If not specified, the OS will decide. |
| `[interface]`| `String` | The interface to bind the socket. If not specified, it will use the current active connection. The current options are: `"wifi"`|
 
## Maintainers
Looking for maintainers!

* [Rapsssito](https://github.com/rapsssito)

## Contributing

PR's welcome!

## License

The library is released under the MIT license. For more information see [`LICENSE`](/LICENSE).
