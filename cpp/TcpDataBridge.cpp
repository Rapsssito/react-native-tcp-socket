// VENHO fork — Phase 1 zero-copy data-plane cxxTurboModule impl.
//
// Milestone-1d finding: removing the base64 PAYLOAD was not enough — any
// per-chunk crossing of the legacy RCTDeviceEventEmitter bridge
// (invokeJavaMethod → dynamicFromValue → folly::dynamic) still OOMs,
// because the bridge's pending-call backlog on the JS thread grows
// unbounded regardless of per-call size. So BOTH the bytes AND the
// "data available" signal must avoid the legacy bridge.
//
// This file therefore also owns a JSI readable notifier: JS registers a
// single `setReadable((id)=>void)` callback; the native socket read
// thread calls TcpDataBridge::signalReadable(id) (via JNI) which hops to
// the JS thread through the CallInvoker and invokes that JS callback
// with just the id. No folly::dynamic, no event emitter, no per-chunk
// Java→JS marshalling. Bytes are then pulled zero-copy via read(id).

#include "TcpDataBridge.h"

#include "TcpInboundRegistry.h"

#include <ReactCommon/CallInvoker.h>
#include <jsi/jsi.h>

#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <utility>

// VENHO Phase 1 — pull TcpBridgeJni.cpp.o into the merged libappmodules
// .so. That TU's only symbol (the implicitly-bound nativeInstallBridge
// JNI entry) is referenced solely at RUNTIME by name, so the NDK
// --gc-sections link would dead-strip the whole object — leaving
// implicit JNI binding with nothing to resolve. This TU is kept (the
// codegen cxxTurboModule depends on it), so a single hard link-time
// reference from here force-keeps the JNI object. Defined in
// android/TcpBridgeJni.cpp.
extern "C" void venho_tcpBridgeJniKeepAnchor();

namespace facebook::react {

namespace {

// Process-global JSI notifier state. The native read thread is NOT a JS
// thread; it must marshal onto the JS thread via the CallInvoker before
// touching the runtime or the JS callback.
//
// VENHO Phase 1 — readable-signal COALESCING (Scenario-C OOM #3 fix).
// The native read loop calls signalReadable() once per in.read() chunk
// (≤16KB). Each call previously did an unconditional
// CallInvoker::invokeAsync(), scheduling a fresh lambda onto RN 0.83's
// bridgeless RuntimeScheduler — whose per-task bookkeeping is a
// folly::dynamic. On an active libp2p connection the native thread
// signals FAR faster than the JS thread drains, so that queue grew
// unbounded: ~9.15M un-freed folly::dynamic nodes / classes 144–448B in
// ~5s, ending in a recursive folly::dynamic::ObjectImpl teardown stack
// overflow (proven 2026-05-17 with kad-DHT OFF + maxConnections:3, i.e.
// ONE idle connection — refuting connection-churn AND crypto, isolating
// THIS path). The JS drain (_drainInbound) already empties the WHOLE
// per-socket queue per call, so at most ONE signal need be in flight per
// socket: `pending` is set test-and-set before scheduling and cleared
// inside the scheduled task right before the JS call, so bytes arriving
// during/after a drain re-arm exactly one more signal. Millions of
// invokeAsync collapse to ~one per drain cycle — no data lost (a
// coalesced-away signal's bytes are taken by the in-flight drain).
struct ReadableNotifier {
  std::mutex mutex;
  jsi::Runtime* runtime = nullptr;
  std::shared_ptr<CallInvoker> invoker;
  std::shared_ptr<jsi::Function> jsCallback;  // (id:number)=>void
  // socket id -> whether a readable invokeAsync is already in flight for
  // it (guarded by `mutex`). Bounded by the number of live sockets.
  std::unordered_map<int32_t, bool> pending;
};

ReadableNotifier& notifier() {
  static ReadableNotifier n;
  return n;
}

// Symmetric notifier for the OUTBOUND write-drain signal. Fired from the
// native socket WRITE thread (also not a JS thread) when the registry's
// per-socket outbound queue drains below its low watermark, so Socket.js
// can emit `drain`. Same CallInvoker hop discipline as the readable one.
struct WriteDrainNotifier {
  std::mutex mutex;
  jsi::Runtime* runtime = nullptr;
  std::shared_ptr<CallInvoker> invoker;
  std::shared_ptr<jsi::Function> jsCallback;  // (id:number)=>void
};

WriteDrainNotifier& writeDrainNotifier() {
  static WriteDrainNotifier n;
  return n;
}

// Notifier for the per-write `written` ACK. Fired from the native socket
// WRITE thread (TcpSenderTask, via JNI) after each chunk is flushed to
// the OutputStream. This REPLACES TcpEventListener.onWritten →
// RCTDeviceEventEmitter.emit("written",…): that legacy-bridge emit ran
// once PER WRITE and, under libp2p handshake volume, accumulated an
// unbounded nested folly::dynamic in the bridgeless event-emitter queue
// — the Scenario-C OOM #2 (giant recursive folly::dynamic teardown,
// same class of bug milestone-1d hit on the readable side). Same
// CallInvoker hop discipline; the JS callback gets (id,msgId,err) where
// err is "" on success.
struct WrittenNotifier {
  std::mutex mutex;
  jsi::Runtime* runtime = nullptr;
  std::shared_ptr<CallInvoker> invoker;
  // (id:number, msgId:number, err:string)=>void  (err==="" ⇒ success)
  std::shared_ptr<jsi::Function> jsCallback;
};

WrittenNotifier& writtenNotifier() {
  static WrittenNotifier n;
  return n;
}

// jsi::MutableBuffer that OWNS a moved InboundChunk. The JS ArrayBuffer
// returned by read() is constructed over this — its storage IS the
// received socket bytes (zero copy). When Hermes GCs the ArrayBuffer,
// this destructs and the chunk's vector frees. Bounded because the
// registry's per-socket queue is bounded (= the backpressure).
class ChunkBuffer : public jsi::MutableBuffer {
 public:
  explicit ChunkBuffer(venho::InboundChunk&& c) : chunk_(std::move(c)) {}
  size_t size() const override { return chunk_.bytes.size(); }
  uint8_t* data() override { return chunk_.bytes.data(); }

 private:
  venho::InboundChunk chunk_;
};

// The installed global.__TcpDataBridge host object.
class DataBridgeHostObject : public jsi::HostObject {
 public:
  jsi::Value get(jsi::Runtime& rt, const jsi::PropNameID& name) override {
    auto prop = name.utf8(rt);
    if (prop == "read") {
      // read(id: number): ArrayBuffer | null  — zero-copy pop.
      return jsi::Function::createFromHostFunction(
          rt, jsi::PropNameID::forAscii(rt, "read"), 1,
          [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args,
             size_t count) -> jsi::Value {
            if (count < 1 || !args[0].isNumber()) {
              return jsi::Value::null();
            }
            auto id = static_cast<int32_t>(args[0].asNumber());
            venho::InboundChunk chunk;
            if (!venho::TcpInboundRegistry::instance().popInbound(id,
                                                                  chunk)) {
              return jsi::Value::null();
            }
            auto buf = std::make_shared<ChunkBuffer>(std::move(chunk));
            return jsi::ArrayBuffer(rt, buf);
          });
    }
    if (prop == "setReadable") {
      // setReadable((id:number)=>void): register the single JS readable
      // notifier. Stored with the runtime + CallInvoker so the native
      // read thread can signal without ever touching the legacy bridge.
      return jsi::Function::createFromHostFunction(
          rt, jsi::PropNameID::forAscii(rt, "setReadable"), 1,
          [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args,
             size_t count) -> jsi::Value {
            if (count < 1 || !args[0].isObject()) {
              return jsi::Value::undefined();
            }
            auto fn = args[0].asObject(rt).asFunction(rt);
            auto& n = notifier();
            std::lock_guard<std::mutex> lk(n.mutex);
            n.runtime = &rt;
            n.jsCallback =
                std::make_shared<jsi::Function>(std::move(fn));
            return jsi::Value::undefined();
          });
    }
    if (prop == "write") {
      // write(id: number, data: ArrayBuffer, msgId: number): boolean
      // Zero-(legacy-)copy outbound. The bytes are copied ONCE off the
      // JS ArrayBuffer into the C++ registry (the JS heap can't be held
      // past this host call) — NO base64, NO @ReactMethod, NO
      // jsi::dynamicFromValue. Returns false at the outbound high
      // watermark so Socket.js latches writableNeedDrain.
      return jsi::Function::createFromHostFunction(
          rt, jsi::PropNameID::forAscii(rt, "write"), 3,
          [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args,
             size_t count) -> jsi::Value {
            if (count < 3 || !args[0].isNumber() || !args[1].isObject() ||
                !args[2].isNumber()) {
              return jsi::Value(true);
            }
            auto obj = args[1].asObject(rt);
            if (!obj.isArrayBuffer(rt)) {
              return jsi::Value(true);
            }
            auto id = static_cast<int32_t>(args[0].asNumber());
            auto msgId = static_cast<int32_t>(args[2].asNumber());
            auto ab = obj.getArrayBuffer(rt);
            bool keepWriting =
                venho::TcpInboundRegistry::instance().pushOutbound(
                    id, ab.data(rt), ab.size(rt), msgId);
            return jsi::Value(keepWriting);
          });
    }
    if (prop == "setWriteDrainable") {
      // setWriteDrainable((id:number)=>void): register the single JS
      // write-drain notifier (symmetric to setReadable). Fired when the
      // native write thread drains the outbound queue below its low
      // watermark so Socket.js can emit `drain`.
      return jsi::Function::createFromHostFunction(
          rt, jsi::PropNameID::forAscii(rt, "setWriteDrainable"), 1,
          [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args,
             size_t count) -> jsi::Value {
            if (count < 1 || !args[0].isObject()) {
              return jsi::Value::undefined();
            }
            auto fn = args[0].asObject(rt).asFunction(rt);
            auto& n = writeDrainNotifier();
            std::lock_guard<std::mutex> lk(n.mutex);
            n.runtime = &rt;
            n.jsCallback =
                std::make_shared<jsi::Function>(std::move(fn));
            return jsi::Value::undefined();
          });
    }
    if (prop == "setWritten") {
      // setWritten((id:number, msgId:number, err:string)=>void):
      // register the single JS per-write ACK callback (symmetric to
      // setReadable). Replaces the legacy `written` device event — the
      // native write thread calls signalWritten() after each flush;
      // err==="" means success.
      return jsi::Function::createFromHostFunction(
          rt, jsi::PropNameID::forAscii(rt, "setWritten"), 1,
          [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args,
             size_t count) -> jsi::Value {
            if (count < 1 || !args[0].isObject()) {
              return jsi::Value::undefined();
            }
            auto fn = args[0].asObject(rt).asFunction(rt);
            auto& n = writtenNotifier();
            std::lock_guard<std::mutex> lk(n.mutex);
            n.runtime = &rt;
            n.jsCallback =
                std::make_shared<jsi::Function>(std::move(fn));
            return jsi::Value::undefined();
          });
    }
    return jsi::Value::undefined();
  }
};

}  // namespace

TcpDataBridge::TcpDataBridge(std::shared_ptr<CallInvoker> jsInvoker)
    : NativeTcpDataBridgeCxxSpec<TcpDataBridge>(jsInvoker) {
  // Stash the CallInvoker so signalReadable() / signalWriteDrain()
  // (called from the native socket read/write threads via JNI) can hop
  // onto the JS thread. Both directions share the one invoker.
  {
    auto& n = notifier();
    std::lock_guard<std::mutex> lk(n.mutex);
    n.invoker = jsInvoker;
  }
  {
    auto& wn = writeDrainNotifier();
    std::lock_guard<std::mutex> lk(wn.mutex);
    wn.invoker = jsInvoker;
  }
  {
    auto& wrn = writtenNotifier();
    std::lock_guard<std::mutex> lk(wrn.mutex);
    wrn.invoker = std::move(jsInvoker);
  }
  // Install the registry → JS write-drain hook. The registry calls this
  // C-function ptr from the native write thread on the low-watermark
  // crossing; it bounces to JS exactly like signalReadable.
  venho::TcpInboundRegistry::instance().setWriteDrainNotifier(
      &TcpDataBridge::signalWriteDrain);

  // Link-time KEEP edge (see comment at the extern decl above): a
  // volatile sink defeats dead-code elimination so the reference — and
  // thus TcpBridgeJni.cpp.o with the nativeInstallBridge JNI export —
  // survives into the merged .so. Never actually skipped at runtime;
  // the volatile read just blocks the optimiser from proving it dead.
  static void (*volatile keep)() = &venho_tcpBridgeJniKeepAnchor;
  keep();
}

bool TcpDataBridge::install(jsi::Runtime& rt) {
  // rt.global() returns a temporary jsi::Object — bind by value.
  auto global = rt.global();
  if (global.hasProperty(rt, "__TcpDataBridge")) {
    return true;  // idempotent
  }
  {
    auto& n = notifier();
    std::lock_guard<std::mutex> lk(n.mutex);
    n.runtime = &rt;
  }
  {
    auto& wn = writeDrainNotifier();
    std::lock_guard<std::mutex> lk(wn.mutex);
    wn.runtime = &rt;
  }
  {
    auto& wrn = writtenNotifier();
    std::lock_guard<std::mutex> lk(wrn.mutex);
    wrn.runtime = &rt;
  }
  auto host = std::make_shared<DataBridgeHostObject>();
  global.setProperty(rt, "__TcpDataBridge",
                     jsi::Object::createFromHostObject(rt, host));
  return true;
}

// Called from the native socket read thread (JNI). Coalesced + bounced
// to the JS thread via the CallInvoker; invokes the single JS readable
// callback with the socket id. NEVER the legacy event bridge.
void TcpDataBridge::signalReadable(int32_t id) {
  std::shared_ptr<CallInvoker> invoker;
  {
    auto& n = notifier();
    std::lock_guard<std::mutex> lk(n.mutex);
    if (!n.invoker || !n.jsCallback || !n.runtime) {
      return;  // JS not ready yet — bytes stay queued; a later signal
               // (or the JS resume drain) will pick them up.
    }
    // COALESCE: if a readable task is already in flight for this socket,
    // do NOT schedule another. The pending drain empties the entire
    // per-socket queue, so it will also take whatever bytes this call
    // just made available. This collapses the per-16KB-chunk invokeAsync
    // storm (the Scenario-C OOM #3 unbounded RuntimeScheduler/
    // folly::dynamic backlog) to ~one task per drain cycle. Test-and-set
    // under the same mutex that the task clears the flag under.
    bool& pend = n.pending[id];
    if (pend) {
      return;
    }
    pend = true;
    invoker = n.invoker;
  }
  invoker->invokeAsync([id]() {
    auto& n = notifier();
    jsi::Runtime* rt;
    std::shared_ptr<jsi::Function> cb;
    {
      std::lock_guard<std::mutex> lk(n.mutex);
      // Clear BEFORE the JS call: any signalReadable() racing in while
      // the JS drain runs will then re-arm exactly one fresh task, so
      // bytes that arrive mid-drain are never stranded.
      n.pending[id] = false;
      rt = n.runtime;
      cb = n.jsCallback;
    }
    if (rt && cb) {
      cb->call(*rt, jsi::Value(static_cast<double>(id)));
    }
  });
}

void TcpDataBridge::forgetSocket(int32_t id) {
  auto& n = notifier();
  std::lock_guard<std::mutex> lk(n.mutex);
  n.pending.erase(id);
}

// Called from the native socket WRITE thread (via the registry's
// write-drain hook) when the per-socket outbound queue drained below its
// low watermark. Symmetric to signalReadable: bounce to the JS thread
// via the CallInvoker and invoke the JS write-drain callback with the
// socket id so Socket.js can emit `drain`. NEVER the legacy bridge.
void TcpDataBridge::signalWriteDrain(int32_t id) {
  std::shared_ptr<CallInvoker> invoker;
  {
    auto& n = writeDrainNotifier();
    std::lock_guard<std::mutex> lk(n.mutex);
    if (!n.invoker || !n.jsCallback || !n.runtime) {
      return;  // JS not ready — the next pushOutbound/drain re-signals.
    }
    invoker = n.invoker;
  }
  invoker->invokeAsync([id]() {
    auto& n = writeDrainNotifier();
    jsi::Runtime* rt;
    std::shared_ptr<jsi::Function> cb;
    {
      std::lock_guard<std::mutex> lk(n.mutex);
      rt = n.runtime;
      cb = n.jsCallback;
    }
    if (rt && cb) {
      cb->call(*rt, jsi::Value(static_cast<double>(id)));
    }
  });
}

// Called from the native socket WRITE thread (TcpSenderTask, via JNI)
// after each chunk is flushed. Bounces to the JS thread via the
// CallInvoker and invokes the JS `written` ACK callback with
// (id, msgId, err) — err=="" on success. This is the per-write ACK
// REPLACEMENT for the legacy RCTDeviceEventEmitter "written" event,
// which accumulated an unbounded folly::dynamic per write (Scenario-C
// OOM #2). `err` is copied into the lambda (the JNI string is gone by
// the time the async hop runs).
void TcpDataBridge::signalWritten(int32_t id, int32_t msgId,
                                  const std::string& err) {
  std::shared_ptr<CallInvoker> invoker;
  {
    auto& n = writtenNotifier();
    std::lock_guard<std::mutex> lk(n.mutex);
    if (!n.invoker || !n.jsCallback || !n.runtime) {
      return;  // JS not ready — the write still happened; the optional
               // user write-callback just won't fire (best-effort ACK,
               // exactly as a dropped legacy event would have been).
    }
    invoker = n.invoker;
  }
  invoker->invokeAsync([id, msgId, err]() {
    auto& n = writtenNotifier();
    jsi::Runtime* rt;
    std::shared_ptr<jsi::Function> cb;
    {
      std::lock_guard<std::mutex> lk(n.mutex);
      rt = n.runtime;
      cb = n.jsCallback;
    }
    if (rt && cb) {
      cb->call(*rt, jsi::Value(static_cast<double>(id)),
               jsi::Value(static_cast<double>(msgId)),
               jsi::String::createFromUtf8(*rt, err));
    }
  });
}

}  // namespace facebook::react
