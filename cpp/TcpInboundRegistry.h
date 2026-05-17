// VENHO fork — Phase 1 zero-copy socket data registry (platform-shared
// C++). Owns BOTH directions of the socket data plane:
//
//  INBOUND  — the native socket read thread (Android: TcpReceiverTask
//   via JNI; iOS: GCDAsyncSocket via the same C++ API) pushes received
//   chunks here as owned byte buffers. JS pulls them via the JSI host
//   object as zero-copy ArrayBuffers (the buffer's storage IS the pushed
//   chunk; freeing the JS ArrayBuffer frees the chunk).
//
//  OUTBOUND — JS pushes bytes to send via the JSI host object's write(),
//   straight from the JS ArrayBuffer into an owned chunk (one copy off
//   the JS heap; NO base64, NO folly::dynamic, NO @ReactMethod). The
//   native socket WRITE thread pops chunks here and writes them to the
//   socket OutputStream. This is the symmetric replacement for the
//   Phase-0 `NativeModules.TcpSockets.write(id, base64, msgId)` Java
//   TurboModule call, whose per-write jsi::dynamicFromValue marshalling
//   was the residual Scudo OOM (Scenario C, after inbound was fixed).
//
// Backpressure (both directions): each per-socket queue has a bounded
// depth. Inbound: pushInbound() returns false at the high watermark and
// the native read loop must pause — TCP flow control backpressures the
// peer; the loop polls canResume(). Outbound: pushOutbound() returns
// false at the high watermark and JS must stop writing (Socket.js
// surfaces this as `writableNeedDrain`); the C++ side fires the drain
// notifier once the write thread has drained below the low watermark.
// Memory is bounded by the fixed queues, never the unbounded
// folly::dynamic backlog.

#pragma once

#include <condition_variable>
#include <cstdint>
#include <deque>
#include <memory>
#include <mutex>
#include <unordered_map>
#include <vector>

namespace venho {

// One chunk of socket data; owns its bytes. INBOUND chunks are moved
// into the queue then handed to JS as the backing store of a
// jsi::ArrayBuffer (no copy). OUTBOUND chunks are copied once off the JS
// ArrayBuffer (the JS heap can't be referenced past the host call) then
// moved to the native write thread. `msgId` is meaningful only for
// outbound — it is echoed back on the `written` ack.
struct InboundChunk {
  std::vector<uint8_t> bytes;
  int32_t msgId = -1;
};

// Outbound is structurally identical to a received chunk; alias so the
// queue/registry code reads symmetrically.
using OutboundChunk = InboundChunk;

// Bounded per-socket queues (both directions) + watermark state.
class SocketInbound {
 public:
  // High/low watermarks in queued chunks. 16 KiB native reads × 64 =
  // ~1 MiB ceiling per socket before the read loop is paused — far
  // below anything that pressures the allocator, and the peer's TCP
  // window stalls once we stop reading.
  static constexpr size_t kHighWater = 64;
  static constexpr size_t kLowWater = 16;

  // Outbound watermarks. libp2p/yamux emits many small frames; a deeper
  // queue absorbs bursts without forcing JS to spin on drain, while
  // still bounding memory (256 × typical frame ≪ allocator pressure).
  static constexpr size_t kOutHighWater = 256;
  static constexpr size_t kOutLowWater = 64;

  // High-watermark latch. Set true by pushInbound when the queue fills
  // (Java read loop must pause); cleared by popInbound once drained to
  // the low watermark (Java polls canResume to learn this).
  bool paused = false;
  std::deque<InboundChunk> queue;

  // Outbound: set true by pushOutbound at the high watermark (JS must
  // stop writing); cleared by popOutbound at the low watermark, which
  // also fires the drain notifier so JS resumes.
  bool writePaused = false;
  std::deque<OutboundChunk> outQueue;
};

class TcpInboundRegistry {
 public:
  static TcpInboundRegistry& instance();

  // Called by the native socket layer when a socket starts listening.
  void registerSocket(int32_t id);
  void unregisterSocket(int32_t id);

  // Native read thread → push a received chunk (takes ownership).
  // Returns true if the caller may keep reading; false if the queue hit
  // the high watermark and the caller must pause the socket read loop
  // (the registry will call the resume callback when drained).
  bool pushInbound(int32_t id, const uint8_t* data, size_t len);

  // JS (via the JSI host object) → pop the next chunk for a socket.
  // Returns false if the queue is empty. On the drain that crosses the
  // low watermark while paused, schedules the resume callback.
  bool popInbound(int32_t id, InboundChunk& out);

  // Java's paused read loop polls this: true once the queue drained to
  // the low watermark (so the loop may resume reading the socket).
  // Poll-based instead of a JNI upcall to keep the glue minimal and
  // avoid attaching the C++ pop-caller thread to the JVM.
  bool canResume(int32_t id);

  // ---- OUTBOUND (JS write → native socket OutputStream) ----------------

  // JS (via the JSI host object's write()) → enqueue bytes to send,
  // copied once off the JS ArrayBuffer (the JS heap can't be held past
  // the host call). `msgId` is echoed on the write ack. Returns true if
  // JS may keep writing; false if the bounded outbound queue hit the
  // high watermark and JS must stop (Socket.js sets writableNeedDrain).
  bool pushOutbound(int32_t id, const uint8_t* data, size_t len,
                    int32_t msgId);

  // Native socket WRITE thread → pop the next chunk to write to the
  // OutputStream. Returns false if the queue is empty. On the pop that
  // crosses the low watermark while write-paused, clears the latch and
  // (if set) fires the JS write-drain notifier so JS resumes writing.
  bool popOutbound(int32_t id, OutboundChunk& out);

  // The native write thread blocks here when its outbound queue is
  // empty, woken by pushOutbound — avoids a busy-poll on the write
  // executor. Returns false if the socket was unregistered (thread must
  // exit). `out` receives the next chunk when available.
  bool waitPopOutbound(int32_t id, OutboundChunk& out);

  // Register the JS write-drain notifier (one global callback, keyed by
  // id at call time) — symmetric to the inbound readable notifier. Set
  // by TcpDataBridge::setWriteDrainNotifier; invoked by popOutbound on
  // the low-watermark crossing so JS can emit `drain`.
  using WriteDrainFn = void (*)(int32_t id);
  void setWriteDrainNotifier(WriteDrainFn fn);

 private:
  std::mutex mutex_;
  std::condition_variable outCv_;
  WriteDrainFn writeDrainFn_ = nullptr;
  std::unordered_map<int32_t, std::unique_ptr<SocketInbound>> sockets_;
};

}  // namespace venho
