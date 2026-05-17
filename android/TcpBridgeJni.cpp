// VENHO fork — Phase 1 JNI glue: Java socket read thread → C++ inbound
// registry. The Java TcpReceiverTask, instead of base64+WritableMap+
// RCTDeviceEventEmitter (the Phase-0 folly::dynamic OOM path), calls
// these to push raw bytes into the bounded C++ queue the JSI host
// object drains zero-copy.
//
// Registered via explicit JNI (RegisterNatives in JNI_OnLoad) for the
// Java class com.asterinet.react.tcpsocket.TcpDataBridgeNative.

#include "TcpDataBridge.h"
#include "TcpInboundRegistry.h"

#include <jni.h>

#include <cstdint>
#include <string>

namespace {

// pushInbound(int id, byte[] data, int len) -> boolean
// Returns false when the bounded queue hit the high watermark and the
// Java read loop must pause (registry fires resume via the no-op below;
// Java polls canResume()).
jboolean nativePushInbound(JNIEnv* env, jclass, jint id, jbyteArray data,
                           jint len) {
  jbyte* buf = env->GetByteArrayElements(data, nullptr);
  bool keepReading = venho::TcpInboundRegistry::instance().pushInbound(
      static_cast<int32_t>(id), reinterpret_cast<const uint8_t*>(buf),
      static_cast<size_t>(len));
  env->ReleaseByteArrayElements(data, buf, JNI_ABORT);  // no copy-back
  return keepReading ? JNI_TRUE : JNI_FALSE;
}

// registerSocket(int id): create the bounded queue. The "resume" signal
// is polled by Java (canResume) rather than a JNI upcall, to keep this
// glue minimal and avoid attaching the C++ caller thread to the JVM.
void nativeRegisterSocket(JNIEnv*, jclass, jint id) {
  // Java polls canResume() for backpressure — no resume callback.
  venho::TcpInboundRegistry::instance().registerSocket(
      static_cast<int32_t>(id));
}

void nativeUnregisterSocket(JNIEnv*, jclass, jint id) {
  venho::TcpInboundRegistry::instance().unregisterSocket(
      static_cast<int32_t>(id));
  // Drop this socket's readable-coalescing pending entry so the
  // process-global map stays bounded across many short-lived libp2p
  // peer connections.
  facebook::react::TcpDataBridge::forgetSocket(static_cast<int32_t>(id));
}

// canResume(int id): true once the queue drained below the low
// watermark (Java's paused read loop polls this on a short wait).
jboolean nativeCanResume(JNIEnv*, jclass, jint id) {
  return venho::TcpInboundRegistry::instance().canResume(
             static_cast<int32_t>(id))
             ? JNI_TRUE
             : JNI_FALSE;
}

// waitWriteChunk(int id, int[] msgIdOut) -> byte[] | null
// Blocks the native write thread until the socket's OUTBOUND queue (fed
// zero-copy by the JSI write() host fn) has a chunk, then returns its
// bytes and writes the chunk's msgId into msgIdOut[0]. Returns null when
// the socket was unregistered (write thread must exit). One JNI call;
// the only allocation is the unavoidable jbyteArray that must cross to
// Java — NO base64, NO folly::dynamic, NO @ReactMethod.
jbyteArray nativeWaitWriteChunk(JNIEnv* env, jclass, jint id,
                                jintArray msgIdOut) {
  venho::OutboundChunk chunk;
  if (!venho::TcpInboundRegistry::instance().waitPopOutbound(
          static_cast<int32_t>(id), chunk)) {
    return nullptr;  // socket gone — signal the write thread to exit
  }
  const auto len = static_cast<jsize>(chunk.bytes.size());
  jbyteArray out = env->NewByteArray(len);
  if (out == nullptr) {
    return nullptr;  // OOM on the Java heap — let the write thread exit
  }
  if (len > 0) {
    env->SetByteArrayRegion(
        out, 0, len, reinterpret_cast<const jbyte*>(chunk.bytes.data()));
  }
  if (msgIdOut != nullptr && env->GetArrayLength(msgIdOut) >= 1) {
    jint mid = static_cast<jint>(chunk.msgId);
    env->SetIntArrayRegion(msgIdOut, 0, 1, &mid);
  }
  return out;
}

// signalReadable(int id): "data available for socket id" — hops to the
// JS thread via the CallInvoker and calls the registered JS readable
// callback. This is the legacy-bridge-FREE replacement for the old
// RCTDeviceEventEmitter "readable" emit that still OOM'd in 1d.
void nativeSignalReadable(JNIEnv*, jclass, jint id) {
  facebook::react::TcpDataBridge::signalReadable(static_cast<int32_t>(id));
}

// signalWritten(int id, int msgId, String err): per-write ACK — hops to
// the JS thread via the CallInvoker and calls the registered JS
// `written` callback with (id,msgId,err). err is "" on success (Java
// passes null → treated as ""). Legacy-bridge-FREE replacement for the
// RCTDeviceEventEmitter "written" emit that accumulated an unbounded
// folly::dynamic per write (Scenario-C OOM #2). The std::string is
// copied before the async hop, so the Java string may be released.
void nativeSignalWritten(JNIEnv* env, jclass, jint id, jint msgId,
                         jstring err) {
  std::string errStr;
  if (err != nullptr) {
    const char* c = env->GetStringUTFChars(err, nullptr);
    if (c != nullptr) {
      errStr.assign(c);
      env->ReleaseStringUTFChars(err, c);
    }
  }
  facebook::react::TcpDataBridge::signalWritten(
      static_cast<int32_t>(id), static_cast<int32_t>(msgId), errStr);
}

const JNINativeMethod kMethods[] = {
    {"nativePushInbound", "(I[BI)Z",
     reinterpret_cast<void*>(nativePushInbound)},
    {"nativeRegisterSocket", "(I)V",
     reinterpret_cast<void*>(nativeRegisterSocket)},
    {"nativeUnregisterSocket", "(I)V",
     reinterpret_cast<void*>(nativeUnregisterSocket)},
    {"nativeCanResume", "(I)Z",
     reinterpret_cast<void*>(nativeCanResume)},
    {"nativeSignalReadable", "(I)V",
     reinterpret_cast<void*>(nativeSignalReadable)},
    {"nativeSignalWritten", "(IILjava/lang/String;)V",
     reinterpret_cast<void*>(nativeSignalWritten)},
    {"nativeWaitWriteChunk", "(I[I)[B",
     reinterpret_cast<void*>(nativeWaitWriteChunk)},
};

}  // namespace

// VENHO Phase 1 — JNI registration LIFETIME fix (replaces JNI_OnLoad).
//
// The fork's native code is autolinked as a STATIC lib and merged into
// libappmodules.so (RN New-Arch single-merged-lib model: see
// android/CMakeLists.txt + the generated Android-autolinking.cmake).
// libappmodules.so has exactly ONE JNI_OnLoad, invoked by SoLoader VERY
// early — before the JS bundle runs, with the bootstrap classloader.
// FindClass("com/asterinet/.../TcpDataBridgeNative") from THAT context
// returns null (the RN app classes aren't reachable from the bootstrap
// loader), so the old JNI_OnLoad returned JNI_ERR and the 7 natives were
// NEVER registered → UnsatisfiedLinkError when libp2p first tore a
// socket down (nativeUnregisterSocket). Per-`.so` JNI_OnLoad is NOT
// re-invoked, so ensureLoaded()'s loadLibrary couldn't recover it.
//
// Fix: ONE *implicitly* bound bootstrap method,
// Java_com_asterinet_react_tcpsocket_TcpDataBridgeNative_nativeInstallBridge.
// Implicit JNI binding resolves Java_<class>_<method> by exported-symbol
// lookup across already-loaded .so's — no JNI_OnLoad, no RegisterNatives
// needed for IT. Java's TcpDataBridgeNative.ensureLoaded() calls it once;
// because the call originates in Java, `env` carries the APP classloader
// and `clazz` IS TcpDataBridgeNative — so the explicit RegisterNatives
// for the other 7 succeeds deterministically, at first socket use.
extern "C" JNIEXPORT void JNICALL
Java_com_asterinet_react_tcpsocket_TcpDataBridgeNative_nativeInstallBridge(
    JNIEnv* env, jclass clazz) {
  // `clazz` is TcpDataBridgeNative itself (passed by the JVM for a
  // static native). No FindClass / classloader hazard.
  if (env->RegisterNatives(clazz, kMethods,
                           sizeof(kMethods) / sizeof(kMethods[0])) != 0) {
    // Leave any pending exception for Java to surface (ensureLoaded's
    // caller will see it) rather than silently swallowing — a hard,
    // loud failure here is correct: the data plane cannot work without
    // these natives, and a quiet failure would resurface later as the
    // same opaque UnsatisfiedLinkError this fix eliminates.
  }
}

// VENHO Phase 1 — link-time KEEP anchor.
//
// This TU only defines a JNI entry point that is resolved at RUNTIME by
// name (implicit binding). Nothing references it at LINK time, so the
// merged-lib link (NDK default --gc-sections) dead-strips this entire
// object file out of libappmodules.so — exactly what happened on the
// first attempt (the .a had the symbol; the merged .so did not, so
// implicit JNI lookup found nothing). TcpDataBridge.cpp IS kept (the
// codegen cxxTurboModule references it), so having its constructor touch
// this no-op creates the single link-time edge that pulls TcpBridgeJni
// .cpp.o — and therefore the nativeInstallBridge export — into the .so.
// Must be a real, externally-visible definition (not inline / not
// static) so the reference cannot be optimised away.
extern "C" void venho_tcpBridgeJniKeepAnchor() {}
