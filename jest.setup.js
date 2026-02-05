jest.mock('react-native', () => {
    // Mock NativeEventEmitter
    class NativeEventEmitter {
        constructor() {
            this.addListener = jest.fn(() => ({ remove: () => {} }));
        }
    }

    return {
        NativeModules: {
            TcpSockets: {
                connect: jest.fn(),
                end: jest.fn(),
                destroy: jest.fn(),
                write: jest.fn(),
                listen: jest.fn(),
                pause: jest.fn(),
                resume: jest.fn(),
                setKeepAlive: jest.fn(),
                setNoDelay: jest.fn(),
            },
        },
        NativeEventEmitter: NativeEventEmitter,
    };
});
