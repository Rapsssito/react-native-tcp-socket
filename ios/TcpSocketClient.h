#import "CocoaAsyncSocket/GCDAsyncSocket.h"
#import <React/RCTBridgeModule.h>


extern NSString *const RCTTCPErrorDomain;

enum RCTTCPError {
    RCTTCPNoError = 0,            // Never used
    RCTTCPInvalidInvocationError, // Invalid method invocation
    RCTTCPBadConfigError,         // Invalid configuration
    RCTTCPBadParamError,          // Invalid parameter was passed
    RCTTCPSendTimeoutError,       // A send operation timed out
    RCTTCPSendFailedError,        // A send operation failed
    RCTTCPClosedError,            // The socket was closed
    RCTTCPOtherError,             // Description provided in userInfo
};

typedef enum RCTTCPError RCTTCPError;

@class TcpSocketClient;

@protocol SocketClientDelegate <NSObject>

- (void)addClient:(TcpSocketClient *)client;
- (void)onConnect:(TcpSocketClient *)client;
- (void)onListen:(TcpSocketClient *)server;
- (void)onConnection:(TcpSocketClient *)client toClient:(NSNumber *)clientID;
- (void)onSecureConnection:(TcpSocketClient *)client
                  toClient:(NSNumber *)clientID;
- (void)onData:(NSNumber *)clientID data:(NSData *)data;
- (void)onClose:(TcpSocketClient *)client withError:(NSError *)err;
- (void)onError:(TcpSocketClient *)client withError:(NSError *)err;
- (void)onWrittenData:(TcpSocketClient *)client msgId:(NSNumber *)msgId;
- (NSNumber *)getNextId;

@end

@interface TcpSocketClient : NSObject <GCDAsyncSocketDelegate>

@property(nonatomic, retain) NSNumber *id;
@property(nonatomic, weak) id<SocketClientDelegate> clientDelegate;

- (GCDAsyncSocket *)getSocket;

///---------------------------------------------------------------------------------------
/// @name Class Methods
///---------------------------------------------------------------------------------------
/**
 * Initializes a new RCTTCPClient
 *
 * @param delegate The object holding the callbacks, usually 'self'.
 *
 * @return New RCTTCPClient
 */

+ (id)socketClientWithId:(NSNumber *)clientID
               andConfig:(id<SocketClientDelegate>)delegate;

///---------------------------------------------------------------------------------------
/// @name Instance Methods
///---------------------------------------------------------------------------------------
/**
 * Connects to a host and port
 * @param port port
 * @param host ip address
 * @param options NSDictionary which can have @"localAddress" and @"localPort"
 * to specify the local interface
 * @return true if connected, false if there was an error
 */
- (BOOL)connect:(NSString *)host
           port:(int)port
    withOptions:(NSDictionary *)options
     tlsOptions:(NSDictionary *)tlsOptions
          error:(NSError **)error;

/**
 * Starts listening on a local host and port
 *
 * @param options NSDictionary which must have a @"port" and @"host" to specify
 * where to listen
 * @return true if connected, false if there was an error
 */
- (BOOL)listen:(NSDictionary *)options error:(NSError **)error;

/**
 * Returns the address information
 *
 * @return NSDictionary with @"address" host, @"port" port, @"family" IPv4/IPv6
 */
- (NSDictionary<NSString *, id> *)getAddress;

/**
 * write data
 *
 */
- (void)writeData:(NSData *)data msgId:(NSNumber *)msgId;

- (void)startTLS:(NSDictionary *)tlsOptions;

/**
 * end client
 */
- (void)end;

/**
 * destroy client
 */
- (void)destroy;

- (void)setNoDelay:(BOOL)noDelay;

- (void)setKeepAlive:(BOOL)enable initialDelay:(int)initialDelay;

- (void)pause;

- (void)resume;

@end
