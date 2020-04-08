#import "TcpSocketClient.h"

#import <React/RCTEventEmitter.h>
#import "CocoaAsyncSocket/GCDAsyncSocket.h"

@interface TcpSockets : RCTEventEmitter<SocketClientDelegate>

@end
