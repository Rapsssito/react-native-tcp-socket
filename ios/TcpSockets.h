#import "TcpSocketClient.h"

#import "CocoaAsyncSocket/GCDAsyncSocket.h"
#import <React/RCTEventEmitter.h>


@interface TcpSockets : RCTEventEmitter <SocketClientDelegate>

@end
