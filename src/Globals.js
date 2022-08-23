import { NativeEventEmitter } from 'react-native';

let instanceNumber = 0;

function getNextId() {
    return instanceNumber++;
}

const nativeEventEmitter = new NativeEventEmitter({
    addListener: () => null,
    removeListeners: () => null,
});

export { nativeEventEmitter, getNextId };
