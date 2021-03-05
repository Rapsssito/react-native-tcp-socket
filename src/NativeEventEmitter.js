import { NativeEventEmitter, NativeModules } from 'react-native';
const Sockets = NativeModules.TcpSockets;

const nativeEventEmitter = new NativeEventEmitter(Sockets);

export default nativeEventEmitter;
