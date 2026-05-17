// VENHO fork — Phase 1 zero-copy data-plane cxxTurboModule.
//
// Header name `TcpDataBridge` matches react-native.config.js
// `cxxModuleHeaderName`. Extends the codegen-generated CxxSpec base for
// the `NativeTcpDataBridge` TS spec (one method: install()). install()
// registers `global.__TcpDataBridge`, a jsi::HostObject exposing the
// FULL zero-copy data plane (no codegen/folly path — that was the
// Phase-0 OOM, then the residual Scenario-C OOM on the write side):
//
//   read(id)            -> next inbound chunk as a ZERO-COPY
//                          jsi::ArrayBuffer (MutableBuffer owns the
//                          moved bytes; freeing it frees the chunk).
//   setReadable(cb)     -> register the single inbound-ready JS cb.
//   write(id, ab, msgId)-> enqueue an outbound chunk, copied once off
//                          the JS ArrayBuffer into the C++ registry;
//                          returns false at the outbound high watermark
//                          (JS must stop writing). NO base64, NO
//                          @ReactMethod, NO jsi::dynamicFromValue.
//   setWriteDrainable(cb)-> register the single write-drain JS cb,
//                          fired when the native write thread drains the
//                          outbound queue below its low watermark.

#pragma once

// Codegen emits the CxxSpec base (NativeTcpDataBridgeCxxSpec) into this
// header, named after codegenConfig.name. On the include path via the
// generated jni/CMakeLists.txt target_include_directories.
#include <RNTcpSocketsSpecJSI.h>

#include <memory>
#include <string>

namespace facebook::react {

class TcpDataBridge : public NativeTcpDataBridgeCxxSpec<TcpDataBridge> {
 public:
  explicit TcpDataBridge(std::shared_ptr<CallInvoker> jsInvoker);

  // Codegen method: install the global JSI host object. Idempotent.
  bool install(jsi::Runtime& rt);

  // Called from the native socket read thread (via JNI) after bytes are
  // queued. Hops to the JS thread through the CallInvoker and invokes
  // the registered JS readable callback with the socket id. Static: no
  // module instance is needed on the read thread (process-global
  // notifier state). NEVER crosses the legacy event bridge — that was
  // the milestone-1d OOM.
  static void signalReadable(int32_t id);

  // Registry write-drain notifier (C-function ptr signature). The C++
  // registry calls this from the native write thread when the outbound
  // queue drains below its low watermark; it hops to the JS thread via
  // the CallInvoker and invokes the registered JS write-drain callback
  // with the socket id (so Socket.js can emit `drain`). Symmetric to
  // signalReadable; installed into the registry by the constructor.
  static void signalWriteDrain(int32_t id);

  // Called from the native socket WRITE thread (TcpSenderTask, via JNI)
  // after each chunk is flushed to the OutputStream. Hops to the JS
  // thread via the CallInvoker and invokes the registered JS `written`
  // ACK callback with (id, msgId, err) — err=="" on success. This is
  // the per-write ACK replacement for the legacy RCTDeviceEventEmitter
  // "written" event (the Scenario-C OOM #2: per-write folly::dynamic
  // accumulation in the bridgeless event-emitter queue).
  static void signalWritten(int32_t id, int32_t msgId,
                            const std::string& err);

  // Called from nativeUnregisterSocket (JNI) when a socket is torn down.
  // Erases that socket's readable-coalescing `pending` entry so the
  // process-global map does not grow across many short-lived connections
  // (libp2p opens/closes lots of peer connections). Static: same
  // process-global notifier state as signalReadable.
  static void forgetSocket(int32_t id);
};

}  // namespace facebook::react
