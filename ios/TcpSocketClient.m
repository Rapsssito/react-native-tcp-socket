#import "TcpSocketClient.h"
#import <arpa/inet.h>
#import <netinet/in.h>
#import <netinet/tcp.h>

#import <React/RCTLog.h>

NSString *const RCTTCPErrorDomain = @"RCTTCPErrorDomain";

@interface TcpSocketClient () {
  @private
    BOOL _tls;
    BOOL _checkValidity;
    BOOL _paused;
    BOOL _connecting;
    NSString *_certPath;
    NSString *_host;
    GCDAsyncSocket *_tcpSocket;
    NSMutableDictionary<NSNumber *, NSNumber *> *_pendingSends;
    NSDictionary *_tlsSettings;
    NSLock *_lock;
    NSNumber *_serverId;
    long _sendTag;
}

- (id)initWithClientId:(NSNumber *)clientID
             andConfig:(id<SocketClientDelegate>)aDelegate;
- (id)initWithClientId:(NSNumber *)clientID
             andConfig:(id<SocketClientDelegate>)aDelegate
             andSocket:(GCDAsyncSocket *)tcpSocket
             andServer:(NSNumber *)serverID;

@end

@implementation TcpSocketClient

- (GCDAsyncSocket *)getSocket {
    return _tcpSocket;
}

+ (id)socketClientWithId:(nonnull NSNumber *)clientID
               andConfig:(id<SocketClientDelegate>)delegate {
    return [[[self class] alloc] initWithClientId:clientID
                                        andConfig:delegate
                                        andSocket:nil
                                        andServer:nil];
}

- (id)initWithClientId:(NSNumber *)clientID
             andConfig:(id<SocketClientDelegate>)aDelegate {
    return [self initWithClientId:clientID andConfig:aDelegate andSocket:nil andServer:nil];
}

- (id)initWithClientId:(NSNumber *)clientID
             andConfig:(id<SocketClientDelegate>)aDelegate
             andSocket:(GCDAsyncSocket *)tcpSocket
             andServer:(NSNumber *)serverID;
{
    self = [super init];
    if (self) {
        _id = clientID;
        _clientDelegate = aDelegate;
        _paused = false;
        _connecting = false;
        _pendingSends = [NSMutableDictionary dictionary];
        _lock = [[NSLock alloc] init];
        _tcpSocket = tcpSocket;
        _serverId = serverID;
        [_tcpSocket setUserData:clientID];
        [_tcpSocket setDelegate:self];
        [_tcpSocket setDelegateQueue:[self methodQueue]];
    }

    return self;
}

- (BOOL)connect:(NSString *)host
           port:(int)port
    withOptions:(NSDictionary *)options
     tlsOptions:(NSDictionary *)tlsOptions
          error:(NSError **)error {
    if (_tcpSocket) {
        if (error) {
            *error = [self badInvocationError:
                               @"this client's socket is already connected"];
        }

        return false;
    }

    _tcpSocket = [[GCDAsyncSocket alloc] initWithDelegate:self
                                            delegateQueue:[self methodQueue]];
    [_tcpSocket setUserData:_id];

    BOOL result = false;

    NSString *localAddress = options[@"localAddress"];
    NSNumber *localPort = options[@"localPort"];

    _host = host;
    _connecting = true;
    if (!localAddress && !localPort) {
        result = [_tcpSocket connectToHost:host onPort:port error:error];
    } else {
        NSMutableArray *interface = [NSMutableArray arrayWithCapacity:2];
        [interface addObject:localAddress ? localAddress : @""];
        if (localPort) {
            [interface addObject:[localPort stringValue]];
        }
        result =
            [_tcpSocket connectToHost:host
                               onPort:port
                         viaInterface:[interface componentsJoinedByString:@":"]
                          withTimeout:-1
                                error:error];
    }
    if (result && tlsOptions) {
        [self startTLS:tlsOptions];
    }
    return result;
}

- (void)startTLS:(NSDictionary *)tlsOptions {
    if (_tls) return;
    NSMutableDictionary *settings = [NSMutableDictionary dictionary];
    NSString *certResourcePath = tlsOptions[@"ca"];
    BOOL checkValidity = (tlsOptions[@"rejectUnauthorized"]
                              ? [tlsOptions[@"rejectUnauthorized"] boolValue]
                              : true);
    if (!checkValidity) {
        // Do not validate
        _checkValidity = false;
        [settings setObject:[NSNumber numberWithBool:YES]
                     forKey:GCDAsyncSocketManuallyEvaluateTrust];
    } else if (certResourcePath != nil) {
        // Self-signed certificate
        _certPath = certResourcePath;
        [settings setObject:[NSNumber numberWithBool:YES]
                     forKey:GCDAsyncSocketManuallyEvaluateTrust];
    } else {
        // Default certificates
        [settings setObject:_host forKey:(NSString *)kCFStreamSSLPeerName];
    }
    _tls = true;
    [_tcpSocket startTLS:settings];
}

- (NSDictionary<NSString *, id> *)getAddress {
    if (_tcpSocket) {
        if (_tcpSocket.isConnected) {
            return @{
                @"port" : @(_tcpSocket.connectedPort),
                @"address" : _tcpSocket.connectedHost ?: @"unknown",
                @"family" : _tcpSocket.isIPv6 ? @"IPv6" : @"IPv4"
            };
        } else {
            return @{
                @"port" : @(_tcpSocket.localPort),
                @"address" : _tcpSocket.localHost ?: @"unknown",
                @"family" : _tcpSocket.isIPv6 ? @"IPv6" : @"IPv4"
            };
        }
    }

    return @{@"port" : @(0), @"address" : @"unknown", @"family" : @"unkown"};
}

- (void)setNoDelay:(BOOL)noDelay {
    [_tcpSocket performBlock:^{
      int fd = [self->_tcpSocket socketFD];
      int on = noDelay ? 1 : 0;
      if (setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, (char *)&on, sizeof(on)) ==
          -1) {
          /* TODO: handle error */
          RCTLogWarn(@"react-native-tcp-socket: setNoDelay() caused an "
                     @"unexpected error");
      }
    }];
}

- (void)setKeepAlive:(BOOL)enable initialDelay:(int)initialDelay {
    [_tcpSocket performBlock:^{
      int fd = [self->_tcpSocket socketFD];
      int on = enable ? 1 : 0;
      int enableKA = setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &on, sizeof(on));
      // `initialDelay` is ignored
      if (enableKA == -1) {
          /* TODO: handle error */
          RCTLogWarn(@"react-native-tcp-socket: setKeepAlive() caused an "
                     @"unexpected error");
      }
    }];
}

- (BOOL)listen:(NSDictionary *)options error:(NSError **)error {
    if (_tcpSocket) {
        if (error) {
            *error = [self badInvocationError:
                               @"this client's socket is already connected"];
        }

        return false;
    }

    _tcpSocket = [[GCDAsyncSocket alloc] initWithDelegate:self
                                            delegateQueue:[self methodQueue]];
    [_tcpSocket setUserData:_id];

    // Get TLS data if present
    NSDictionary *tlsOptions = options[@"tls"];
    if (tlsOptions) {
        BOOL success = [self setSecureContext:tlsOptions];
        if (!success) {
            if (error) {
                *error = [self badInvocationError:@"failed to set TLS context"];
            }
            return false;
        }
    }

    // Get the host and port
    NSString *host = options[@"host"];
    int port = [options[@"port"] intValue];

    // GCDAsyncSocket doesn't recognize 0.0.0.0
    if ([@"0.0.0.0" isEqualToString:host]) {
        host = nil;
    }
    BOOL isListening = [_tcpSocket acceptOnInterface:host
                                                port:port
                                               error:error];
    if (isListening == YES) {
        [_clientDelegate onListen:self];
    }

    return isListening;
}

- (BOOL)setSecureContext:(NSDictionary *)tlsOptions {
    NSString *keystoreResourcePath = tlsOptions[@"keystore"];
    NSURL *keystoreUrl = [[NSURL alloc] initWithString:keystoreResourcePath];
    NSData *pkcs12data = [[NSData alloc] initWithContentsOfURL:keystoreUrl];
    CFDataRef inPCKS12Data = (CFDataRef)CFBridgingRetain(pkcs12data);
    CFStringRef password = CFSTR("");
    const void *keys[] = {kSecImportExportPassphrase};
    const void *values[] = {password};
    CFDictionaryRef options =
        CFDictionaryCreate(NULL, keys, values, 1, NULL, NULL);

    CFArrayRef items = CFArrayCreate(NULL, 0, 0, NULL);

    OSStatus securityError = SecPKCS12Import(inPCKS12Data, options, &items);
    CFRelease(options);
    CFRelease(password);

    if (securityError != errSecSuccess) {
        return false;
    }

    CFDictionaryRef identityDict = CFArrayGetValueAtIndex(items, 0);
    SecIdentityRef myIdent = (SecIdentityRef)CFDictionaryGetValue(
        identityDict, kSecImportItemIdentity);

    SecIdentityRef certArray[1] = {myIdent};
    CFArrayRef myCerts = CFArrayCreate(NULL, (void *)certArray, 1, NULL);

    _tlsSettings = [NSMutableDictionary dictionary];
    [(NSMutableDictionary*) _tlsSettings setObject:[NSNumber numberWithBool:YES]
                                            forKey:(NSString *)kCFStreamSSLIsServer];
    [(NSMutableDictionary*) _tlsSettings setObject:[NSNumber numberWithInteger:2]
                                            forKey:GCDAsyncSocketSSLProtocolVersionMin];
    [(NSMutableDictionary*) _tlsSettings setObject:[NSNumber numberWithInteger:8]
                                            forKey:GCDAsyncSocketSSLProtocolVersionMax];
    [(NSMutableDictionary*) _tlsSettings setObject:(id)CFBridgingRelease(myCerts)
                                            forKey:(NSString *)kCFStreamSSLCertificates];
    _tls = true;
    return true;
}

- (void)setPendingSend:(NSNumber *)msgId forKey:(NSNumber *)key {
    [_lock lock];
    @try {
        [_pendingSends setObject:msgId forKey:key];
    } @finally {
        [_lock unlock];
    }
}

- (NSNumber *)getPendingSend:(NSNumber *)key {
    [_lock lock];
    @try {
        return [_pendingSends objectForKey:key];
    } @finally {
        [_lock unlock];
    }
}

- (void)dropPendingSend:(NSNumber *)key {
    [_lock lock];
    @try {
        [_pendingSends removeObjectForKey:key];
    } @finally {
        [_lock unlock];
    }
}

- (void)socket:(GCDAsyncSocket *)sock didWriteDataWithTag:(long)msgTag {
    NSNumber *tagNum = [NSNumber numberWithLong:msgTag];
    NSNumber *msgId = [self getPendingSend:tagNum];
    if (msgId) {
        [_clientDelegate onWrittenData:self msgId:msgId];
        [self dropPendingSend:tagNum];
    }
}

- (void)writeData:(NSData *)data msgId:(NSNumber *)msgId {
    [self setPendingSend:msgId forKey:@(_sendTag)];
    [_tcpSocket writeData:data withTimeout:-1 tag:_sendTag];

    _sendTag++;
}

- (void)end {
    [_tcpSocket disconnectAfterWriting];
}

- (void)destroy {
    [_tcpSocket disconnect];
}

- (void)pause {
    _paused = true;
}

- (void)resume {
    if (_paused) {
        [_tcpSocket readDataWithTimeout:-1 tag:_id.longValue];
    }
    _paused = false;
}

- (void)socket:(GCDAsyncSocket *)sock
    didReadData:(NSData *)data
        withTag:(long)tag {
    if (!_clientDelegate) {
        RCTLogWarn(@"didReadData with nil clientDelegate for %@",
                   [sock userData]);
        return;
    }

    [_clientDelegate onData:@(tag) data:data];
    if (!_paused) {
        [sock readDataWithTimeout:-1 tag:tag];
    }
}

- (void)socket:(GCDAsyncSocket *)sock
    didAcceptNewSocket:(GCDAsyncSocket *)newSocket {
    TcpSocketClient *inComing =
        [[TcpSocketClient alloc] initWithClientId:[_clientDelegate getNextId]
                                        andConfig:_clientDelegate
                                        andSocket:newSocket
                                        andServer:_id];
    // Store the socket or the connection will be closed
    [_clientDelegate addClient:inComing];
    if (_tls) {
        [newSocket startTLS:_tlsSettings];
    } else {
        [_clientDelegate onConnection:inComing toClient:_id];
    }
    [newSocket readDataWithTimeout:-1 tag:inComing.id.longValue];
}

- (void)socketDidSecure:(GCDAsyncSocket *)sock {
    // Only for TLS
    if (!_clientDelegate) {
        RCTLogWarn(@"socketDidSecure with nil clientDelegate for %@",
                   [sock userData]);
        return;
    }
    if (_serverId != nil) {
        [_clientDelegate onSecureConnection:self toClient:_serverId];
    } else if (_connecting) {
        [_clientDelegate onConnect:self];
        _connecting = false;
    }
    _tls = true;
}

- (void)socket:(GCDAsyncSocket *)sock
      didReceiveTrust:(SecTrustRef)trust
    completionHandler:(void (^)(BOOL shouldTrustPeer))completionHandler {
    // Check if we should check the validity
    if (!_checkValidity) {
        completionHandler(YES);
        return;
    }

    // Server certificate
    SecCertificateRef serverCertificate =
        SecTrustGetCertificateAtIndex(trust, 0);
    CFDataRef serverCertificateData = SecCertificateCopyData(serverCertificate);
    const UInt8 *const serverData = CFDataGetBytePtr(serverCertificateData);
    const CFIndex serverDataSize = CFDataGetLength(serverCertificateData);
    NSData *cert1 = [NSData dataWithBytes:serverData
                                   length:(NSUInteger)serverDataSize];

    // Local certificate
    NSURL *certUrl = [[NSURL alloc] initWithString:_certPath];
    NSString *pem = [[NSString alloc] initWithContentsOfURL:certUrl
                                                   encoding:NSUTF8StringEncoding
                                                      error:NULL];

    // Strip PEM header and footers. We don't support multi-certificate PEM.
    NSMutableString *pemMutable =
        [pem stringByTrimmingCharactersInSet:
                 NSCharacterSet.whitespaceAndNewlineCharacterSet]
            .mutableCopy;

    // Strip PEM header and footer
    [pemMutable
        replaceOccurrencesOfString:@"-----BEGIN CERTIFICATE-----"
                        withString:@""
                           options:(NSStringCompareOptions)(NSAnchoredSearch |
                                                            NSLiteralSearch)
                             range:NSMakeRange(0, pemMutable.length)];

    [pemMutable
        replaceOccurrencesOfString:@"-----END CERTIFICATE-----"
                        withString:@""
                           options:(NSStringCompareOptions)(NSAnchoredSearch |
                                                            NSBackwardsSearch |
                                                            NSLiteralSearch)
                             range:NSMakeRange(0, pemMutable.length)];

    NSData *pemData = [[NSData alloc]
        initWithBase64EncodedString:pemMutable
                            options:
                                NSDataBase64DecodingIgnoreUnknownCharacters];
    SecCertificateRef localCertificate =
        SecCertificateCreateWithData(NULL, (CFDataRef)pemData);
    if (!localCertificate) {
        [NSException raise:@"Configuration invalid"
                    format:@"Failed to parse PEM certificate"];
    }

    CFDataRef myCertData = SecCertificateCopyData(localCertificate);
    const UInt8 *const localData = CFDataGetBytePtr(myCertData);
    const CFIndex localDataSize = CFDataGetLength(myCertData);
    NSData *cert2 = [NSData dataWithBytes:localData
                                   length:(NSUInteger)localDataSize];

    if (cert1 == nil || cert2 == nil) {
        RCTLogWarn(@"BAD SSL CERTIFICATE");
        completionHandler(NO);
        return;
    }
    if ([cert1 isEqualToData:cert2]) {
        completionHandler(YES);
    } else {
        completionHandler(NO);
    }
}

- (void)socket:(GCDAsyncSocket *)sock
    didConnectToHost:(NSString *)host
                port:(uint16_t)port {
    if (!_clientDelegate) {
        RCTLogWarn(@"didConnectToHost with nil clientDelegate for %@",
                   [sock userData]);
        return;
    }

    // Show up if SSL handsake is done
    if (!_tls) {
        [_clientDelegate onConnect:self];
    }
    [sock readDataWithTimeout:-1 tag:_id.longValue];
}

- (void)socketDidCloseReadStream:(GCDAsyncSocket *)sock {
    // TODO : investigate for half-closed sockets
    // for now close the stream completely
    [sock disconnect];
}

- (void)socketDidDisconnect:(GCDAsyncSocket *)sock withError:(NSError *)err {
    if (!_clientDelegate) {
        RCTLogWarn(@"socketDidDisconnect with nil clientDelegate for %@",
                   [sock userData]);
        return;
    }

    [_clientDelegate
          onClose:[sock userData]
        withError:(!err || err.code == GCDAsyncSocketClosedError ? nil : err)];
}

- (NSError *)badInvocationError:(NSString *)errMsg {
    NSDictionary *userInfo =
        [NSDictionary dictionaryWithObject:errMsg
                                    forKey:NSLocalizedDescriptionKey];

    return [NSError errorWithDomain:RCTTCPErrorDomain
                               code:RCTTCPInvalidInvocationError
                           userInfo:userInfo];
}

- (dispatch_queue_t)methodQueue {
    return dispatch_get_main_queue();
}

@end
