# react-native-tcp-socket

## Getting started

`$ npm install react-native-tcp-socket --save`

### Mostly automatic installation

`$ react-native link react-native-tcp-socket`

### Manual installation


#### iOS

1. In XCode, in the project navigator, right click `Libraries` ➜ `Add Files to [your project's name]`
2. Go to `node_modules` ➜ `react-native-tcp-socket` and add `TcpSocket.xcodeproj`
3. In XCode, in the project navigator, select your project. Add `libTcpSocket.a` to your project's `Build Phases` ➜ `Link Binary With Libraries`
4. Run your project (`Cmd+R`)<

#### Android

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


## Usage
```javascript
import TcpSocket from 'react-native-tcp-socket';

// TODO: What to do with the module?
TcpSocket;
```
