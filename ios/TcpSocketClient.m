#import "TcpSocketClient.h"
#import <arpa/inet.h>
#import <netinet/in.h>
#import <netinet/tcp.h>

#import <React/RCTLog.h>

#import <CommonCrypto/CommonDigest.h>
#import <Security/Security.h>
#import <Security/SecCertificate.h>
#import <Security/SecItem.h>
#import <Security/SecKey.h>
#import <Security/SecPolicy.h>
#import <Security/SecImportExport.h>

NSString *const RCTTCPErrorDomain = @"RCTTCPErrorDomain";

@implementation ResolvableOption

- (instancetype)initWithValue:(NSString *)value needsResolution:(BOOL)needsResolution {
    if (self = [super init]) {
        _value = value;
        _needsResolution = needsResolution;
    }
    return self;
}

+ (instancetype)optionWithValue:(NSString *)value needsResolution:(BOOL)needsResolution {
    return [[self alloc] initWithValue:value needsResolution:needsResolution];
}

- (NSString *)resolve {
    if (!self.needsResolution) {
        return self.value;
    }
    
    NSURL *url = [[NSURL alloc] initWithString:self.value];
    NSError *error = nil;
    NSString *contents = [[NSString alloc] initWithContentsOfURL:url 
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
    ResolvableOption *_resolvableKey;
    ResolvableOption *_resolvableCert;
    NSString *_host;
    GCDAsyncSocket *_tcpSocket;
    NSMutableDictionary<NSNumber *, NSNumber *> *_pendingSends;
    NSDictionary *_tlsSettings;
    NSLock *_lock;
    NSNumber *_serverId;
    long _sendTag;
    SecTrustRef _peerTrust;
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

- (ResolvableOption *)getResolvableOption:(NSDictionary *)tlsOptions forKey:(NSString *)key {
    if (![tlsOptions objectForKey:key]) {
        return nil;
    }
    
    NSString *value = tlsOptions[key];
    NSArray *resolvedKeys = tlsOptions[@"resolvedKeys"];
    BOOL needsResolution = resolvedKeys != nil && [resolvedKeys containsObject:key];
    
    return [ResolvableOption optionWithValue:value needsResolution:needsResolution];
}

- (void)startTLS:(NSDictionary *)tlsOptions {
    if (_tls) return;
    NSMutableDictionary *settings = [NSMutableDictionary dictionary];
    _resolvableCaCert = [self getResolvableOption:tlsOptions forKey:@"ca"];
    _resolvableKey = [self getResolvableOption:tlsOptions forKey:@"key"];
    _resolvableCert = [self getResolvableOption:tlsOptions forKey:@"cert"];
    NSString *keyAlias = tlsOptions[@"keyAlias"] ?: @"key";
    [settings setObject:keyAlias forKey:@"keyAlias"];
    NSString *certAlias = tlsOptions[@"certAlias"] ?: @"cert";
    [settings setObject:certAlias forKey:@"certAlias"];
    
    RCTLogWarn(@"startTLS: Resolved options - CA: %@, Key exists: %@, Cert exists: %@",
               _resolvableCaCert ? @"YES" : @"NO",
               _resolvableKey ? @"YES" : @"NO",
               _resolvableCert ? @"YES" : @"NO");
    
    BOOL checkValidity = (tlsOptions[@"rejectUnauthorized"]
                              ? [tlsOptions[@"rejectUnauthorized"] boolValue]
                              : true);
    if (!checkValidity) {
        // Do not validate
        RCTLogWarn(@"startTLS: Validation disabled");
        _checkValidity = false;
        [settings setObject:[NSNumber numberWithBool:YES]
                     forKey:GCDAsyncSocketManuallyEvaluateTrust];
    } else if (_resolvableCaCert != nil) {
        // Self-signed certificate
        RCTLogWarn(@"startTLS: Using self-signed certificate validation");
        [settings setObject:[NSNumber numberWithBool:YES]
                     forKey:GCDAsyncSocketManuallyEvaluateTrust];
    } else {
        // Default certificates
        RCTLogWarn(@"startTLS: Using default certificate validation with host: %@", _host);
        [settings setObject:_host forKey:(NSString *)kCFStreamSSLPeerName];
    }

    // Handle client certificate authentication
    if (_resolvableCert != nil && _resolvableKey != nil) {
        RCTLogWarn(@"startTLS: Attempting client certificate authentication");
        NSString *pemCert = [_resolvableCert resolve];
        NSString *pemKey = [_resolvableKey resolve];
        
        RCTLogWarn(@"startTLS: Resolved PEM cert exists: %@, PEM key exists: %@",
                   pemCert ? @"YES" : @"NO",
                   pemKey ? @"YES" : @"NO");
        
        if (pemCert && pemKey) {
            SecIdentityRef identity = [self createIdentityWithCert:pemCert privateKey:pemKey settings:settings];
            RCTLogWarn(@"startTLS: Identity creation %@", identity ? @"successful" : @"failed");
            if (identity) {
                NSArray *certificates = @[(__bridge id)identity];
                [settings setObject:certificates forKey:(NSString *)kCFStreamSSLCertificates];
                CFRelease(identity);
                RCTLogWarn(@"startTLS: Client certificates configured successfully");
            } else {
                RCTLogWarn(@"startTLS: Failed to create identity from cert and key");
            }
        }
    }

    RCTLogWarn(@"startTLS: Final settings: %@", settings);
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
    NSString *cleanedCaCert = [self stripPEMHeader:pemCaCert prefix:@"CERTIFICATE"];
    NSData *pemCaCertData = [[NSData alloc] initWithBase64EncodedString:cleanedCaCert
                                                               options:NSDataBase64DecodingIgnoreUnknownCharacters];

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

// https://stackoverflow.com/questions/45997841/how-to-get-a-secidentityref-from-a-seccertificateref-and-a-seckeyref
// We use a private API call here; it's good enough for WebKit.
SecIdentityRef SecIdentityCreate(CFAllocatorRef allocator, SecCertificateRef certificate, SecKeyRef privateKey);

- (NSData *)extractRSAKeyFromPKCS8:(NSData *)pkcs8Data {
    // PKCS#8 format has a 26-byte header before the RSA private key
    // For a proper solution, you should use ASN.1 parsing
    // This is a temporary solution that works with standard RSA keys
    if (pkcs8Data.length <= 26) {
        return nil;
    }
    return [pkcs8Data subdataWithRange:NSMakeRange(26, pkcs8Data.length - 26)];
}

- (SecIdentityRef)createIdentityWithCert:(NSString *)pemCert
                              privateKey:(NSString *)pemKey
                                settings:(NSDictionary *)settings {
    RCTLogWarn(@"createIdentity: Starting identity creation");
    
    // Strip PEM headers and convert to data
    NSString *cleanedCert = [self stripPEMHeader:pemCert prefix:@"CERTIFICATE"];
    NSString *cleanedPrivateKey = [self stripPEMHeader:pemKey prefix:@"PRIVATE KEY"];
    NSString *certAlias = settings[@"certAlias"];
    NSString *keyAlias= settings[@"keyAlias"];
    
    NSData *certData = [[NSData alloc] initWithBase64EncodedString:cleanedCert
                                                           options:NSDataBase64DecodingIgnoreUnknownCharacters];
    NSData *pkcs8KeyData = [[NSData alloc] initWithBase64EncodedString:cleanedPrivateKey
                                                               options:NSDataBase64DecodingIgnoreUnknownCharacters];
    
    if (!certData || !pkcs8KeyData) {
        RCTLogWarn(@"createIdentity: Failed to create data from base64");
        return NULL;
    }
    
    // Creates a certificate object from its DER representation
    SecCertificateRef cert = SecCertificateCreateWithData(NULL, (__bridge CFDataRef)certData);
    if (!cert) {
        RCTLogWarn(@"createIdentity: Failed to create certificate from data");
        return NULL;
    }
    
    // Extract RSA key from PKCS#8 - TODO use a ASN1 decoder to detect the key format ...
    // For my own use I know it's a pem but I prefer not to trust a file extension and
    // it's better to check from asn1 data
    NSData *rsaKeyData = [self extractRSAKeyFromPKCS8:pkcs8KeyData];
    if (!rsaKeyData) {
        RCTLogWarn(@"Failed to extract RSA key from PKCS#8");
        CFRelease(cert);
        return NULL;
    }
    
    NSDictionary *privateKeyAttributes = @{
        //(__bridge id)kSecClass: (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeRSA,
        (__bridge id)kSecAttrKeyClass: (__bridge id)kSecAttrKeyClassPrivate,
        //(__bridge id)kSecAttrLabel: kKeychainPrivateKeyLabel,
        //(__bridge id)kSecAttrApplicationTag: [kKeychainApplicationTag dataUsingEncoding:NSUTF8StringEncoding],
    };
    
    CFErrorRef error = NULL;
    SecKeyRef privateKey = SecKeyCreateWithData((__bridge CFDataRef)rsaKeyData,
                                                (__bridge CFDictionaryRef)privateKeyAttributes,
                                                &error);
    if (!privateKey) {
        RCTLogWarn(@"createIdentity: Failed to create private key: %@", error);
        CFRelease(cert);
        if (error) CFRelease(error);
        return NULL;
    }
    
    NSDictionary *deleteKeyQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrLabel: keyAlias
    };
    SecItemDelete((__bridge CFDictionaryRef)deleteKeyQuery);
    
    // Import certificate in keychain
    NSDictionary *deleteCertQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassCertificate,
        (__bridge id)kSecAttrLabel: certAlias
    };
    SecItemDelete((__bridge CFDictionaryRef)deleteCertQuery);
    
    NSDictionary *certAttributes = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassCertificate,
        (__bridge id)kSecValueRef: (__bridge id)cert,
        (__bridge id)kSecAttrLabel: certAlias
    };
    OSStatus status = SecItemAdd((__bridge CFDictionaryRef)certAttributes, NULL);
    if (status != errSecSuccess && status != errSecDuplicateItem) {
        RCTLogWarn(@"createIdentity: Failed to store certificate, status: %d", (int)status);
        CFRelease(cert);
        //CFRelease(privateKey);
        return NULL;
    }
    
    // Add the private key to keychain
    NSDictionary *keyAttributes = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeRSA,
        (__bridge id)kSecAttrKeyClass: (__bridge id)kSecAttrKeyClassPrivate,
        //(__bridge id)kSecValueData: keyData,
        //(__bridge id)kSecReturnPersistentRef: @YES,
        //(__bridge id)kSecAttrKeySizeInBits: @(keySize),
        //(__bridge id)kSecAttrIsPermanent: @YES,
        //(__bridge id)kSecAttrAccessible: (__bridge id)kSecAttrAccessibleAfterFirstUnlock,
        (__bridge id)kSecAttrLabel: keyAlias,
        //(__bridge id)kSecAttrApplicationTag: [kKeychainApplicationTag dataUsingEncoding:NSUTF8StringEncoding],
    };
    status = SecItemAdd((__bridge CFDictionaryRef)keyAttributes, NULL);
    
    if (status != errSecSuccess && status != errSecDuplicateItem) {
        RCTLogWarn(@"createIdentity: Failed to store private key, status: %d", (int)status);
        CFRelease(cert);
        //CFRelease(privateKey);
        return NULL;
    }
    
    // Try to retrieve private key from keychain
    //    NSDictionary *privateKeyQuery = @{
    //        (__bridge id)kSecClass: (__bridge id)kSecClassKey,
    //        (__bridge id)kSecMatchLimit: (__bridge id)kSecMatchLimitOne,
    //        (__bridge id)kSecReturnRef: @YES,
    //        (__bridge id)kSecReturnData: @YES,
    //        (__bridge id)kSecAttrLabel: @"My PrivateKey",
    //        //(__bridge id)kSecAttrApplicationTag: [kKeychainApplicationTag dataUsingEncoding:NSUTF8StringEncoding],
    //        //(__bridge id)kSecUseDataProtectionKeychain: @YES
    //    };
    //    SecKeyRef privateKey = NULL;
    //    status = SecItemCopyMatching((__bridge CFDictionaryRef)privateKeyQuery, (CFTypeRef *)&privateKey);
    
    // Add the certificate to keychain
    //    NSDictionary *certAttributes = @{
    //        (__bridge id)kSecClass: (__bridge id)kSecClassCertificate,
    //        (__bridge id)kSecValueRef: (__bridge id)cert,
    //        (__bridge id)kSecAttrLabel: kKeychainCertificateLabel
    //    };
    //
    //    status = SecItemAdd((__bridge CFDictionaryRef)certAttributes, NULL);
    //    if (status != errSecSuccess && status != errSecDuplicateItem) {
    //        RCTLogWarn(@"createIdentity: Failed to store certificate, status: %d", (int)status);
    //        CFRelease(cert);
    //        CFRelease(privateKey);
    //        return NULL;
    //    }
    
    //    // Query for the identity with correct attributes
    //    NSDictionary *identityQuery = @{
    //        (__bridge id)kSecClass: (__bridge id)kSecClassIdentity,
    //        (__bridge id)kSecMatchLimit: (__bridge id)kSecMatchLimitOne,
    //        (__bridge id)kSecReturnRef: @YES,
    //        //(__bridge id)kSecAttrLabel: @"My Certificate",
    //        //(__bridge id)kSecUseDataProtectionKeychain: @YES
    //    };
    NSDictionary *identityQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassIdentity,
        (__bridge id)kSecReturnRef: @YES,
        (__bridge id)kSecMatchItemList:@[(__bridge id)cert],
        (__bridge id)kSecMatchLimit: (__bridge id)kSecMatchLimitOne,
        //(__bridge id)kSecAttrLabel: @"My Certificate",
        //(__bridge id)kSecUseDataProtectionKeychain: @YES
    };
    
    
    // Query for the identity
    //    NSDictionary *identityQuery = @{
    //        (__bridge id)kSecClass: (__bridge id)kSecClassIdentity,
    //        (__bridge id)kSecReturnRef: @YES,
    //        (__bridge id)kSecMatchLimit: (__bridge id)kSecMatchLimitOne
    //    };
    
    SecIdentityRef identity = NULL;
    identity = SecIdentityCreate(NULL, cert, privateKey);
    //status = SecItemCopyMatching((__bridge CFDictionaryRef)identityQuery, (CFTypeRef *)&identity);
    //
    //    if (status != errSecSuccess || !identity) {
    //        RCTLogWarn(@"createIdentity: Failed to find identity, status: %d", (int)status);
    //    } else {
    //        RCTLogWarn(@"createIdentity: Successfully found identity");
    //    }
    
    // Clean up
    CFRelease(cert);
    CFRelease(privateKey);
    
    return identity;
}

- (NSString *)stripPEMHeader:(NSString *)pemData prefix:(NSString *)prefix {
    NSMutableString *cleaned = [pemData mutableCopy];
    
    // Remove header
    NSString *header = [NSString stringWithFormat:@"-----BEGIN %@-----", prefix];
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
    NSArray *components = [cleaned componentsSeparatedByCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    NSString *result = [components componentsJoinedByString:@""];
    
    return result;
}

- (NSDictionary *)getPeerCertificate {
    if (!_tcpSocket || !_tls || !_peerTrust) {
        return nil;
    }
    
    SecCertificateRef certificate = SecTrustGetCertificateAtIndex(_peerTrust, 0);
    if (!certificate) {
        return nil;
    }
    
    return [self certificateToDict:certificate detailed:YES];
}

- (NSDictionary *)getCertificate {
    if (!_tcpSocket || !_tls || !_resolvableCert) {
        return nil;
    }
    
    NSString *pemCert = [_resolvableCert resolve];
    if (!pemCert) {
        return nil;
    }
    
    NSString *cleanedCert = [self stripPEMHeader:pemCert prefix:@"CERTIFICATE"];
    NSData *certData = [[NSData alloc] initWithBase64EncodedString:cleanedCert 
                                                         options:NSDataBase64DecodingIgnoreUnknownCharacters];
    
    SecCertificateRef certificate = SecCertificateCreateWithData(NULL, (__bridge CFDataRef)certData);
    if (!certificate) {
        return nil;
    }
    
    NSDictionary *result = [self certificateToDict:certificate detailed:YES];
    CFRelease(certificate);
    
    return result;
}

- (NSDictionary *)certificateToDict:(SecCertificateRef)certificate detailed:(BOOL)detailed {
    NSMutableDictionary *certInfo = [NSMutableDictionary dictionary];
    
    // Get public key info
    SecKeyRef publicKey = SecCertificateCopyKey(certificate);
    if (publicKey) {
        CFDictionaryRef attributes = SecKeyCopyAttributes(publicKey);
        if (attributes) {
            // Get key size (bits)
            NSNumber *keySize = CFDictionaryGetValue(attributes, kSecAttrKeySizeInBits);
            certInfo[@"bits"] = keySize;
            
            // Get modulus and exponent for RSA keys
            CFDataRef keyData = SecKeyCopyExternalRepresentation(publicKey, NULL);
            if (keyData) {
                NSData *keyDataNS = (__bridge NSData *)keyData;
                
                // For RSA, the external representation is a DER-encoded RSAPublicKey
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
        certInfo[@"subject"] = @{@"CN": (__bridge_transfer NSString *)subjectName};
    }
    
    // Get issuer using the normalized sequence
    CFDataRef issuerSequence = SecCertificateCopyNormalizedIssuerSequence(certificate);
    if (issuerSequence) {
        CFStringRef issuerName = NULL;
        status = SecCertificateCopyCommonName(certificate, &issuerName);
        if (status == errSecSuccess && issuerName) {
            certInfo[@"issuer"] = @{@"CN": (__bridge_transfer NSString *)issuerName};
        }
        CFRelease(issuerSequence);
    }

//    NSData *certData = (__bridge_transfer NSData *)SecCertificateCopyData(certificate);
//    if (certData) {
//        
//    }
//    // Get validity dates
//    CFDictionaryRef values = NULL;
//    status = SecCertificateCopyValues(certificate, NULL, &values);
//    if (status == errSecSuccess && values) {
//        CFDictionaryRef validityPeriod = CFDictionaryGetValue(values, kSecOIDValidityPeriod);
//        if (validityPeriod) {
//            CFArrayRef validityArray = CFDictionaryGetValue(validityPeriod, kSecPropertyKeyValue);
//            if (validityArray && CFArrayGetCount(validityArray) == 2) {
//                CFDictionaryRef notBeforeDict = CFArrayGetValueAtIndex(validityArray, 0);
//                CFDictionaryRef notAfterDict = CFArrayGetValueAtIndex(validityArray, 1);
//                
//                CFStringRef notBefore = CFDictionaryGetValue(notBeforeDict, kSecPropertyKeyValue);
//                CFStringRef notAfter = CFDictionaryGetValue(notAfterDict, kSecPropertyKeyValue);
//                
//                if (notBefore) {
//                    NSDate *fromDate = (__bridge NSDate *)notBefore;
//                    certInfo[@"valid_from"] = [self formatDate:fromDate];
//                }
//                if (notAfter) {
//                    NSDate *toDate = (__bridge NSDate *)notAfter;
//                    certInfo[@"valid_to"] = [self formatDate:toDate];
//                }
//            }
//        }
//        
//        // Check if it's a CA
//        CFDictionaryRef basicConstraints = CFDictionaryGetValue(values, kSecOIDBasicConstraints);
//        if (basicConstraints) {
//            CFTypeRef value = CFDictionaryGetValue(basicConstraints, kSecPropertyKeyValue);
//            if (value) {
//                certInfo[@"ca"] = @(CFBooleanGetValue(value));
//            }
//        }
//        
//        CFRelease(values);
//    }
//    
//    // Get serial number
//    NSData *serialData = (__bridge_transfer NSData *)SecCertificateCopySerialNumber(certificate, NULL);
//    if (serialData) {
//        NSMutableString *serialHex = [NSMutableString string];
//        const unsigned char *bytes = serialData.bytes;
//        for (NSInteger i = 0; i < serialData.length; i++) {
//            [serialHex appendFormat:@"%02X", bytes[i]];
//        }
//        certInfo[@"serialNumber"] = serialHex;
//    }
//    
//    // Get fingerprints
//    NSData *certData = (__bridge_transfer NSData *)SecCertificateCopyData(certificate);
//    if (certData) {
//        certInfo[@"fingerprint"] = [self calculateFingerprint:certData algorithm:CC_SHA1 length:CC_SHA1_DIGEST_LENGTH];
//        certInfo[@"fingerprint256"] = [self calculateFingerprint:certData algorithm:CC_SHA256 length:CC_SHA256_DIGEST_LENGTH];
//        certInfo[@"fingerprint512"] = [self calculateFingerprint:certData algorithm:CC_SHA512 length:CC_SHA512_DIGEST_LENGTH];
//    }
    
    return certInfo;
}

- (BOOL)isRSAKey:(SecKeyRef)key {
    CFDictionaryRef attributes = SecKeyCopyAttributes(key);
    if (!attributes) return NO;
    
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
    
    NSMutableString *modulus = [NSMutableString string];
    for (NSInteger i = 0; i < modulusLength; i++) {
        [modulus appendFormat:@"%02X", bytes[idx + i]];
    }
    idx += modulusLength;
    
    // Read exponent
    if (idx >= length || bytes[idx] != 0x02) return nil;
    idx++;
    
    NSInteger exponentLength = bytes[idx++];
    NSMutableString *exponent = [NSMutableString string];
    for (NSInteger i = 0; i < exponentLength; i++) {
        [exponent appendFormat:@"%02X", bytes[idx + i]];
    }
    
    return @[modulus, exponent];
}

- (NSString *)calculateFingerprint:(NSData *)data algorithm:(unsigned char * (^)(const void *, CC_LONG, unsigned char *))hashFunction length:(CC_LONG)hashLength {
    unsigned char digest[hashLength];
    hashFunction(data.bytes, (CC_LONG)data.length, digest);
    
    NSMutableString *fingerprint = [NSMutableString stringWithCapacity:hashLength * 3];
    for (int i = 0; i < hashLength; i++) {
        [fingerprint appendFormat:@"%02X:", digest[i]];
    }
    return [fingerprint substringToIndex:fingerprint.length - 1]; // Remove last colon
}

//- (NSDictionary *)parseDN:(NSDictionary *)dnDict {
//    NSMutableDictionary *result = [NSMutableDictionary dictionary];
//    
//    // Map common DN fields
//    NSDictionary *mapping = @{
//        (id)kSecOIDCommonName: @"CN",
//        (id)kSecOIDDNQualifier: @"dnQualifier"
//    };
//    
//    for (id key in dnDict) {
//        NSString *mappedKey = mapping[key];
//        if (mappedKey) {
//            NSString *value = dnDict[key];
//            if ([value isKindOfClass:[NSString class]]) {
//                result[mappedKey] = value;
//            }
//        }
//    }
//    
//    return result;
//}

- (NSString *)formatDate:(NSDate *)date {
    NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
    formatter.locale = [[NSLocale alloc] initWithLocaleIdentifier:@"en_US"];
    formatter.dateFormat = @"MMM dd HH:mm:ss yyyy 'GMT'";
    formatter.timeZone = [NSTimeZone timeZoneWithAbbreviation:@"GMT"];
    return [formatter stringFromDate:date];
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
