declare module 'net' {
    import TcpSockets from 'react-native-tcp-socket';
    export = TcpSockets;
}

declare module 'tls' {
    import TcpSockets from 'react-native-tcp-socket';
    export const Server = TcpSockets.TLSServer;
    export const TLSSocket = TcpSockets.TLSSocket;
    export const connect = TcpSockets.connectTLS;
    export const createServer = TcpSockets.createTLSServer;
}
