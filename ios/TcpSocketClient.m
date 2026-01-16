#import "TcpSocketClient.h"
#import <arpa/inet.h>
#import <netinet/in.h>
#import <netinet/tcp.h>

#import <React/RCTLog.h>

#import <CommonCrypto/CommonDigest.h>
#import <Security/SecCertificate.h>
#import <Security/SecImportExport.h>
#import <Security/SecItem.h>
#import <Security/SecKey.h>
#import <Security/SecPolicy.h>
#import <Security/Security.h>

NSString *const RCTTCPErrorDomain = @"RCTTCPErrorDomain";

@implementation ResolvableOption

- (instancetype)initWithValue:(NSString *)value
              needsResolution:(BOOL)needsResolution {
    if (self = [super init]) {
        _value = value;
        _needsResolution = needsResolution;
    }
    return self;
}

+ (instancetype)optionWithValue:(NSString *)value
                needsResolution:(BOOL)needsResolution {
    return [[self alloc] initWithValue:value needsResolution:needsResolution];
}

- (NSString *)resolve {
    if (!self.needsResolution) {
        return self.value;
    }

    NSURL *url = [[NSURL alloc] initWithString:self.value];
    NSError *error = nil;
    NSString *contents =
        [[NSString alloc] initWithContentsOfURL:url
                                       encoding:NSUTF8StringEncoding
                                          error:&error];
    if (error) {
        return nil;
    }
    return contents;
}

@end

@interface TcpSocketClient () {
  @private
    BOOL _tls;
    BOOL _checkValidity;
    BOOL _paused;
    BOOL _connecting;
    ResolvableOption *_resolvableCaCert;
    NSString *_host;
    GCDAsyncSocket *_tcpSocket;
    NSMutableDictionary<NSNumber *, NSNumber *> *_pendingSends;
    NSDictionary *_tlsSettings;
    NSLock *_lock;
    NSNumber *_serverId;
    long _sendTag;
    SecTrustRef _peerTrust;
    SecIdentityRef _clientIdentity;
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
    return [self initWithClientId:clientID
                        andConfig:aDelegate
                        andSocket:nil
                        andServer:nil];
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
    int connectTimeout = options[@"connectTimeout"] ? [options[@"connectTimeout"] intValue] / 1000 : -1;

    _host = host;
    _connecting = true;
    if (!localAddress && !localPort) {
        result = [_tcpSocket connectToHost:host onPort:port withTimeout:connectTimeout error:error];
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
                          withTimeout:connectTimeout
                                error:error];
    }
    if (result && tlsOptions) {
        [self startTLS:tlsOptions];
    }
    return result;
}

- (ResolvableOption *)getResolvableOption:(NSDictionary *)tlsOptions
                                   forKey:(NSString *)key {
    id value = [tlsOptions objectForKey:key];
    if (!value || ![value isKindOfClass:[NSString class]] || [(NSString *)value length] == 0) {
        return nil;
    }

    NSArray *resolvedKeys = tlsOptions[@"resolvedKeys"];
    BOOL needsResolution = resolvedKeys != nil && [resolvedKeys containsObject:key];

    return [ResolvableOption optionWithValue:(NSString *)value
                             needsResolution:needsResolution];
}

- (void)startTLS:(NSDictionary *)tlsOptions {
    if (_tls)
        return;
    NSMutableDictionary *settings = [NSMutableDictionary dictionary];
    _resolvableCaCert = [self getResolvableOption:tlsOptions forKey:@"ca"];
    BOOL checkValidity = (tlsOptions[@"rejectUnauthorized"]
                              ? [tlsOptions[@"rejectUnauthorized"] boolValue]
                              : true);
    if (!checkValidity) {
        // Do not validate
        _checkValidity = false;
        [settings setObject:[NSNumber numberWithBool:YES]
                     forKey:GCDAsyncSocketManuallyEvaluateTrust];
    } else if (_resolvableCaCert != nil) {
        // Self-signed certificate
        [settings setObject:[NSNumber numberWithBool:YES]
                     forKey:GCDAsyncSocketManuallyEvaluateTrust];
    } else {
        // Default certificates
        [settings setObject:_host forKey:(NSString *)kCFStreamSSLPeerName];
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////:
    // Handle client certificate authentication
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////:
    SecIdentityRef myIdent = NULL;
    ResolvableOption *resolvableKey = [self getResolvableOption:tlsOptions forKey:@"key"];
    ResolvableOption *resolvableCert = [self getResolvableOption:tlsOptions forKey:@"cert"];
    NSString *keyAlias = tlsOptions[@"keyAlias"];
    if (keyAlias) { [settings setObject:keyAlias forKey:@"keyAlias"]; }
    NSString *certAlias = tlsOptions[@"certAlias"];
    if (certAlias) { [settings setObject:certAlias forKey:@"certAlias"]; }
    
    // if user provides certAlias without cert it means an identity(cert+key) has already been
    //  inserted in keychain.
    if ((certAlias && certAlias.length > 0) && (!resolvableCert)) {
        //RCTLogWarn(@"startTLS: Trying to find existing identity with certAlias %@", certAlias);
        NSDictionary *identityQuery = @{
            (__bridge id)kSecClass : (__bridge id)kSecClassIdentity,
            (__bridge id)kSecReturnRef : @YES,
            (__bridge id)kSecAttrLabel : certAlias
        };
        SecItemCopyMatching((__bridge CFDictionaryRef)identityQuery, (CFTypeRef *)&myIdent);
        
    } else if (resolvableCert != nil && resolvableKey != nil) {
        //RCTLogWarn(@"startTLS: Attempting client certificate authentication");
        NSString *pemCert = [resolvableCert resolve];
        NSString *pemKey = [resolvableKey resolve];
        if (pemCert && pemKey) {
            myIdent = [self createIdentityWithCert:pemCert
                                        privateKey:pemKey
                                          settings:settings];
            //RCTLogWarn(@"startTLS: Identity creation %@", myIdent ? @"successful" : @"failed");
        }
    }
    
    if (myIdent) {
        if (_clientIdentity) { CFRelease(_clientIdentity); }
        _clientIdentity = (SecIdentityRef)CFRetain(myIdent);
        
        NSArray *myCerts = @[ (__bridge id)myIdent ];
        [settings setObject:myCerts
                     forKey:(NSString *)kCFStreamSSLCertificates];
        //RCTLogWarn(@"startTLS: Client certificates configured successfully");
    }

    //RCTLogWarn(@"startTLS: Final settings: %@", settings);
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
    CFDictionaryRef options = CFDictionaryCreate(NULL, keys, values, 1, NULL, NULL);

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
    [(NSMutableDictionary *)_tlsSettings
        setObject:[NSNumber numberWithBool:YES]
           forKey:(NSString *)kCFStreamSSLIsServer];
    [(NSMutableDictionary *)_tlsSettings
        setObject:[NSNumber numberWithInteger:2]
           forKey:GCDAsyncSocketSSLProtocolVersionMin];
    [(NSMutableDictionary *)_tlsSettings
        setObject:[NSNumber numberWithInteger:8]
           forKey:GCDAsyncSocketSSLProtocolVersionMax];
    [(NSMutableDictionary *)_tlsSettings
        setObject:(id)CFBridgingRelease(myCerts)
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

    // Store the trust reference
    if (_peerTrust) {
        CFRelease(_peerTrust);
    }
    _peerTrust = (SecTrustRef)CFRetain(trust);

    // Check if we should check the validity
    if (!_checkValidity) {
        completionHandler(YES);
        return;
    }

    // Server certificate
    SecCertificateRef serverCertificate = SecTrustGetCertificateAtIndex(trust, 0);
    CFDataRef serverCertificateData = SecCertificateCopyData(serverCertificate);
    const UInt8 *const serverData = CFDataGetBytePtr(serverCertificateData);
    const CFIndex serverDataSize = CFDataGetLength(serverCertificateData);
    NSData *cert1 = [NSData dataWithBytes:serverData
                                   length:(NSUInteger)serverDataSize];

    // Local certificate
    NSString *pemCaCert = [_resolvableCaCert resolve];
    if (!pemCaCert) {
        RCTLogWarn(@"Failed to resolve CA certificate");
        completionHandler(NO);
        return;
    }

    // Strip PEM header and footer
    NSString *cleanedCaCert = [self stripPEMHeader:pemCaCert
                                            prefix:@"CERTIFICATE"];
    NSData *pemCaCertData = [[NSData alloc]
        initWithBase64EncodedString:cleanedCaCert
                            options:
                                NSDataBase64DecodingIgnoreUnknownCharacters];

    SecCertificateRef localCertificate =
        SecCertificateCreateWithData(NULL, (CFDataRef)pemCaCertData);
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
    if (_clientDelegate) {
        [_clientDelegate onEnd:[sock userData]];
    }
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

typedef NS_ENUM(NSInteger, PEMType) {
    PEMTypeUnknown,
    PEMTypeCertificate,
    PEMTypePKCS1,
    PEMTypePKCS8
};

- (PEMType)detectPEMType:(NSString *)pemData {
    if ([pemData containsString:@"BEGIN CERTIFICATE"]) {
        return PEMTypeCertificate;
    }
    if ([pemData containsString:@"BEGIN PRIVATE KEY"]) {
        return PEMTypePKCS8;
    }
    if ([pemData containsString:@"BEGIN RSA PRIVATE KEY"]) {
        return PEMTypePKCS1;
    }
    return PEMTypeUnknown;
}

- (NSData *)getDataFromPEM:(NSString *)pemData error:(NSError **)error {
    PEMType type = [self detectPEMType:pemData];
    if (type == PEMTypeUnknown) {
        if (error) {
            *error = [NSError
                errorWithDomain:RCTTCPErrorDomain
                           code:-1
                       userInfo:@{
                           NSLocalizedDescriptionKey : @"Invalid PEM format"
                       }];
        }
        return nil;
    }

    // Extract the base64 data between headers
    NSString *prefix;
    switch (type) {
    case PEMTypeCertificate:
        prefix = @"CERTIFICATE";
        break;
    case PEMTypePKCS8:
        prefix = @"PRIVATE KEY";
        break;
    case PEMTypePKCS1:
        prefix = @"RSA PRIVATE KEY";
        break;
    default:
        return nil;
    }

    NSString *cleanedPEM = [self stripPEMHeader:pemData prefix:prefix];
    NSData *decodedData = [[NSData alloc]
        initWithBase64EncodedString:cleanedPEM
                            options:
                                NSDataBase64DecodingIgnoreUnknownCharacters];
    // For PKCS#8, extract the RSA key
    if (type == PEMTypePKCS8) {
        return [self extractRSAKeyFromPKCS8:decodedData error:error];
    }

    return decodedData;
}

- (NSData *)extractRSAKeyFromPKCS8:(NSData *)pkcs8Data error:(NSError **)error {
    // RSA 2048-bit PKCS#8 header (26 bytes)
    const uint8_t rsa2048Prefix[] = {
        0x30, 0x82, 0x04, 0xBE, 0x02, 0x01, 0x00, 0x30,
        0x0D, 0x06, 0x09, 0x2A, 0x86, 0x48, 0x86, 0xF7,
        0x0D, 0x01, 0x01, 0x01, 0x05, 0x00, 0x04, 0x82,
        0x04, 0xA8
    };
    
    // Check for minimum data length
    if (pkcs8Data.length <= sizeof(rsa2048Prefix)) {
        if (error) {
            *error = [NSError errorWithDomain:RCTTCPErrorDomain
                                         code:-1
                                     userInfo:@{
                NSLocalizedDescriptionKey: @"Invalid PKCS#8 data: too short"
            }];
        }
        return nil;
    }
    
    // Verify RSA 2048-bit key prefix - We need a ASN1 decoder to support more !!!
    if (memcmp(pkcs8Data.bytes, rsa2048Prefix, sizeof(rsa2048Prefix)) != 0) {
        if (error) {
            *error = [NSError errorWithDomain:RCTTCPErrorDomain
                                         code:-1
                                     userInfo:@{
                NSLocalizedDescriptionKey: @"Unsupported key format: only RSA 2048-bit keys are supported"
            }];
        }
        return nil;
    }
    
    // Extract the RSA private key data
    return [pkcs8Data subdataWithRange:NSMakeRange(sizeof(rsa2048Prefix),
                                                   pkcs8Data.length - sizeof(rsa2048Prefix))];
}

- (SecIdentityRef)createIdentityWithCert:(NSString *)pemCert
                              privateKey:(NSString *)pemKey
                                settings:(NSDictionary *)settings {
    OSStatus status = -1;
    SecIdentityRef identity = NULL;

    // Get aliases from settings
    NSString *certAlias = settings[@"certAlias"] ?: @"clientTlsCert";
    NSString *keyAlias = settings[@"keyAlias"] ?: @"clientTlsKey";

    NSError *pemError = nil;
    NSData *certData = [self getDataFromPEM:pemCert error:&pemError];
    NSData *keyData = [self getDataFromPEM:pemKey error:&pemError];

    if (pemError || !certData || !keyData) {
        RCTLogWarn(@"createIdentity: Failed to process PEM data: %@", pemError);
        return NULL;
    }

    // Creates a certificate object from its DER representation
    SecCertificateRef cert = SecCertificateCreateWithData(NULL, (__bridge CFDataRef)certData);
    if (!cert) {
        RCTLogWarn(@"createIdentity: Failed to create certificate from data");
        return NULL;
    }
    // Import certificate in keychain
    NSDictionary *deleteCertQuery = @{
        (__bridge id)kSecClass : (__bridge id)kSecClassCertificate,
        (__bridge id)kSecAttrLabel: certAlias,
        (__bridge id)kSecReturnRef : @YES
    };
    status = SecItemDelete((__bridge CFDictionaryRef)deleteCertQuery);

    NSDictionary *certAttributes = @{
        //(__bridge id)kSecClass : (__bridge id)kSecClassCertificate,
        (__bridge id)kSecValueRef : (__bridge id)cert,
        (__bridge id)kSecAttrLabel : certAlias,
    };
    status = SecItemAdd((__bridge CFDictionaryRef)certAttributes, NULL);
    if (status != errSecSuccess && status != errSecDuplicateItem) {
        RCTLogWarn(@"createIdentity: Failed to store certificate, status: %d",
                   (int)status);
        CFRelease(cert);
        return NULL;
    }
                                    
    NSDictionary *privateKeyAttributes = @{
        (__bridge id)kSecAttrKeyType : (__bridge id)kSecAttrKeyTypeRSA,
        (__bridge id)kSecAttrKeyClass : (__bridge id)kSecAttrKeyClassPrivate
    };
    CFErrorRef error = NULL;
    SecKeyRef privateKey = SecKeyCreateWithData(
        (__bridge CFDataRef)keyData,
        (__bridge CFDictionaryRef)privateKeyAttributes, &error);
    if (!privateKey) {
        RCTLogWarn(@"createIdentity: Failed to create private key: %@", error);
        CFRelease(cert);
        if (error)
            CFRelease(error);
        return NULL;
    }

    NSDictionary *deleteKeyQuery = @{
        (__bridge id)kSecClass : (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrLabel: keyAlias,
        (__bridge id)kSecReturnRef : @YES
    };
    status = SecItemDelete((__bridge CFDictionaryRef)deleteKeyQuery);

    // Add the private key to keychain
    NSDictionary *keyAttributes = @{
        (__bridge id)kSecValueRef: (__bridge id)privateKey,
        (__bridge id)kSecAttrLabel : keyAlias
    };
    status = SecItemAdd((__bridge CFDictionaryRef)keyAttributes, NULL);
    if (status != errSecSuccess && status != errSecDuplicateItem) {
        RCTLogWarn(@"createIdentity: Failed to store private key, status: %d",
                   (int)status);
        CFRelease(cert);
        CFRelease(privateKey);
        return NULL;
    }
                                    
    NSDictionary *identityQuery = @{
        (__bridge id)kSecClass : (__bridge id)kSecClassIdentity,
        (__bridge id)kSecReturnRef : @YES,
        (__bridge id)kSecAttrLabel : certAlias
    };
    status = SecItemCopyMatching((__bridge CFDictionaryRef)identityQuery,
                                 (CFTypeRef *)&identity);
    
    if (status != errSecSuccess || !identity) {
        RCTLogWarn(@"createIdentity: Failed to find identity, status: %d",
                   (int)status);
    }
    
    // Clean up
    CFRelease(cert);
    CFRelease(privateKey);
    
    return identity;
}

- (NSString *)stripPEMHeader:(NSString *)pemData prefix:(NSString *)prefix {
    NSMutableString *cleaned = [pemData mutableCopy];

    // Remove header
    NSString *header =
        [NSString stringWithFormat:@"-----BEGIN %@-----", prefix];
    [cleaned replaceOccurrencesOfString:header
                             withString:@""
                                options:NSLiteralSearch
                                  range:NSMakeRange(0, cleaned.length)];

    // Remove footer
    NSString *footer = [NSString stringWithFormat:@"-----END %@-----", prefix];
    [cleaned replaceOccurrencesOfString:footer
                             withString:@""
                                options:NSLiteralSearch
                                  range:NSMakeRange(0, cleaned.length)];

    // Remove whitespace and newlines
    NSArray *components =
        [cleaned componentsSeparatedByCharactersInSet:
                     [NSCharacterSet whitespaceAndNewlineCharacterSet]];
    NSString *result = [components componentsJoinedByString:@""];

    return result;
}

+ (BOOL)hasIdentity:(NSDictionary *)aliases {
    NSString *certAlias = aliases[@"certAlias"];
    if (!certAlias) {
        return NO;
    }
    NSDictionary *identityQuery = @{
        (__bridge id)kSecClass : (__bridge id)kSecClassIdentity,
        (__bridge id)kSecAttrLabel : certAlias
    };
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)identityQuery, (CFTypeRef *)NULL);
    return status == errSecSuccess;
}

- (NSDictionary *)getPeerCertificate {
    NSDictionary *result = nil;
    
    if (!_tcpSocket || !_tls || !_peerTrust) {
        return nil;
    }

    SecCertificateRef certificate = SecTrustGetCertificateAtIndex(_peerTrust, 0);
    if (!certificate) {
        return nil;
    }

    result = [self certificateToDict:certificate detailed:YES];
    return result;
}

- (NSDictionary *)getCertificate {
    NSDictionary *result = nil;
    
    if (!_tcpSocket || !_tls) {
        return nil;
    }
    
    SecCertificateRef certificate = NULL;
    if (_clientIdentity) {
        // If we have a client identity, get the certificate from it
        OSStatus status = SecIdentityCopyCertificate(_clientIdentity, &certificate);
        if (status != errSecSuccess) {
            RCTLogWarn(@"getCertificate: Failed to get certificate from identity, status: %d", (int)status);
            return nil;
        }
    }

    result = [self certificateToDict:certificate detailed:YES];
    CFRelease(certificate);

    return result;
}

// We need an ASN1 decoder to parse properly but for my case I only need modulus
// and exponent In addition SecCertificateCopyNormalizedIssuerSequence has some
// issues since it normalizes issuer and we don't want that
- (NSDictionary *)certificateToDict:(SecCertificateRef)certificate
                    detailed:(BOOL)detailed {
    NSMutableDictionary *certInfo = [NSMutableDictionary dictionary];

    // Get public key info
    SecKeyRef publicKey = SecCertificateCopyKey(certificate);
    if (publicKey) {
        CFDictionaryRef attributes = SecKeyCopyAttributes(publicKey);
        if (attributes) {
            // Get key size (bits)
            NSNumber *keySize =
                CFDictionaryGetValue(attributes, kSecAttrKeySizeInBits);
            certInfo[@"bits"] = keySize;

            // Get modulus and exponent for RSA keys
            CFDataRef keyData =
                SecKeyCopyExternalRepresentation(publicKey, NULL);
            if (keyData) {
                NSData *keyDataNS = (__bridge NSData *)keyData;

                // For RSA, the external representation is a DER-encoded
                // RSAPublicKey
                if ([self isRSAKey:publicKey]) {
                    NSArray *components = [self parseRSAPublicKey:keyDataNS];
                    if (components.count == 2) {
                        certInfo[@"modulus"] = components[0];
                        certInfo[@"exponent"] = [NSString stringWithFormat:@"0x%@", components[1]];
                    }
                }

                // Add base64 encoded public key
                certInfo[@"pubkey"] = [keyDataNS base64EncodedStringWithOptions:0];
                CFRelease(keyData);
            }
            CFRelease(attributes);
        }
        CFRelease(publicKey);
    }

    // Get subject
    CFStringRef subjectName = NULL;
    OSStatus status = SecCertificateCopyCommonName(certificate, &subjectName);
    if (status == errSecSuccess && subjectName) {
        certInfo[@"subject"] =
            @{@"CN" : (__bridge_transfer NSString *)subjectName};
    }

    // Get issuer using the normalized sequence
    CFDataRef issuerSequence =
        SecCertificateCopyNormalizedIssuerSequence(certificate);
    if (issuerSequence) {
        CFStringRef issuerName = NULL;
        status = SecCertificateCopyCommonName(certificate, &issuerName);
        if (status == errSecSuccess && issuerName) {
            certInfo[@"issuer"] =
                @{@"CN" : (__bridge_transfer NSString *)issuerName};
        }
        CFRelease(issuerSequence);
    }

    return certInfo;
}

- (BOOL)isRSAKey:(SecKeyRef)key {
    CFDictionaryRef attributes = SecKeyCopyAttributes(key);
    if (!attributes)
        return NO;

    CFStringRef keyType = CFDictionaryGetValue(attributes, kSecAttrKeyType);
    BOOL isRSA = keyType && CFEqual(keyType, kSecAttrKeyTypeRSA);
    CFRelease(attributes);

    return isRSA;
}

- (NSArray *)parseRSAPublicKey:(NSData *)keyData {
    // Parse DER-encoded RSAPublicKey structure
    const uint8_t *bytes = keyData.bytes;
    NSInteger length = keyData.length;
    
    // Skip header and length bytes
    if (length < 2 || bytes[0] != 0x30) return nil;
    
    NSInteger idx = 2;
    if (bytes[1] & 0x80) {
        idx += (bytes[1] & 0x7F);
    }
    
    // Read modulus
    if (idx >= length || bytes[idx] != 0x02) return nil;
    idx++;
    
    NSInteger modulusLength = bytes[idx++];
    if (modulusLength & 0x80) {
        int lenBytes = modulusLength & 0x7F;
        modulusLength = 0;
        for (int i = 0; i < lenBytes; i++) {
            modulusLength = (modulusLength << 8) | bytes[idx++];
        }
    }
    
    // Skip leading zero if present for modulus
    NSInteger startOffset = 0;
    if (bytes[idx] == 0x00) {
        startOffset = 1;
        modulusLength--;
    }
    
    NSMutableString *modulus = [NSMutableString string];
    for (NSInteger i = 0; i < modulusLength; i++) {
        [modulus appendFormat:@"%02X", bytes[idx + startOffset + i]];
    }
    idx += modulusLength + startOffset;
    
    // Read exponent
    if (idx >= length || bytes[idx] != 0x02) return nil;
    idx++;
    
    NSInteger exponentLength = bytes[idx++];
    // Build exponent hex string
    NSMutableString *exponentHex = [NSMutableString string];
    for (NSInteger i = 0; i < exponentLength; i++) {
        [exponentHex appendFormat:@"%02X", bytes[idx + i]];
    }
    
    // Remove leading zeros from the exponent
    NSRegularExpression *re = [NSRegularExpression regularExpressionWithPattern:@"^0+(?=[0-9A-F]+)" options:0 error:nil];
    NSString *exponent = [re stringByReplacingMatchesInString:exponentHex options:0 range:NSMakeRange(0, exponentHex.length) withTemplate:@""];
    
    return @[modulus, exponent];
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
