jest.mock('react-native', () => {
    // Mock NativeEventEmitter
    class NativeEventEmitter {
        constructor() {
            this.addListener = jest.fn(() => ({ remove: () => {} }));
        }
    }

    return {
        NativeModules: {
            TCPSockets: {
                connect: jest.fn(),
                end: jest.fn(),
                destroy: jest.fn(),
                write: jest.fn(),
                listen: jest.fn(),
            },
        },
        NativeEventEmitter: NativeEventEmitter,
    };
});
