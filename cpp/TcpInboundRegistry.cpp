// VENHO fork — Phase 1 zero-copy inbound registry implementation.

#include "TcpInboundRegistry.h"

namespace venho {

TcpInboundRegistry& TcpInboundRegistry::instance() {
  static TcpInboundRegistry inst;
  return inst;
}

void TcpInboundRegistry::registerSocket(int32_t id) {
  std::lock_guard<std::mutex> lk(mutex_);
  sockets_[id] = std::make_unique<SocketInbound>();
}

void TcpInboundRegistry::unregisterSocket(int32_t id) {
  {
    std::lock_guard<std::mutex> lk(mutex_);
    sockets_.erase(id);
  }
  // Wake any native write thread blocked in waitPopOutbound for this
  // (now-erased) socket so it observes the removal and exits.
  outCv_.notify_all();
}

bool TcpInboundRegistry::pushInbound(int32_t id, const uint8_t* data,
                                     size_t len) {
  std::lock_guard<std::mutex> lk(mutex_);
  auto it = sockets_.find(id);
  if (it == sockets_.end()) {
    // Socket gone (closed/destroyed). Drop — the read loop will exit.
    return true;
  }
  SocketInbound* s = it->second.get();
  InboundChunk chunk;
  chunk.bytes.assign(data, data + len);
  s->queue.push_back(std::move(chunk));
  if (s->queue.size() >= SocketInbound::kHighWater) {
    // High watermark: tell the caller to pause the native read loop.
    // popInbound() will fire resume() once drained to low watermark.
    s->paused = true;
    return false;
  }
  return true;
}

bool TcpInboundRegistry::popInbound(int32_t id, InboundChunk& out) {
  std::lock_guard<std::mutex> lk(mutex_);
  auto it = sockets_.find(id);
  if (it == sockets_.end()) {
    return false;
  }
  SocketInbound* s = it->second.get();
  if (s->queue.empty()) {
    return false;
  }
  out = std::move(s->queue.front());
  s->queue.pop_front();
  if (s->paused && s->queue.size() <= SocketInbound::kLowWater) {
    // Cleared latch → next canResume() poll lets the Java loop resume.
    s->paused = false;
  }
  return true;
}

bool TcpInboundRegistry::canResume(int32_t id) {
  std::lock_guard<std::mutex> lk(mutex_);
  auto it = sockets_.find(id);
  if (it == sockets_.end()) {
    return true;  // socket gone — let the loop fall through and exit
  }
  return !it->second->paused;
}

// ---- OUTBOUND (JS write → native socket OutputStream) -----------------

void TcpInboundRegistry::setWriteDrainNotifier(WriteDrainFn fn) {
  std::lock_guard<std::mutex> lk(mutex_);
  writeDrainFn_ = fn;
}

bool TcpInboundRegistry::pushOutbound(int32_t id, const uint8_t* data,
                                      size_t len, int32_t msgId) {
  bool keepWriting;
  {
    std::lock_guard<std::mutex> lk(mutex_);
    auto it = sockets_.find(id);
    if (it == sockets_.end()) {
      // Socket gone — drop. Returning true keeps the JS caller from
      // spuriously latching writableNeedDrain on a dead socket; the
      // write/close path will surface the real error.
      return true;
    }
    SocketInbound* s = it->second.get();
    OutboundChunk chunk;
    chunk.bytes.assign(data, data + len);
    chunk.msgId = msgId;
    s->outQueue.push_back(std::move(chunk));
    if (s->outQueue.size() >= SocketInbound::kOutHighWater) {
      // High watermark: JS must stop writing (Socket.js latches
      // writableNeedDrain). popOutbound fires the drain notifier once
      // the write thread drains below the low watermark.
      s->writePaused = true;
      keepWriting = false;
    } else {
      keepWriting = true;
    }
  }
  // Wake the native write thread (it blocks in waitPopOutbound when its
  // queue is empty). Notify outside the lock.
  outCv_.notify_all();
  return keepWriting;
}

bool TcpInboundRegistry::popOutbound(int32_t id, OutboundChunk& out) {
  WriteDrainFn drainFn = nullptr;
  bool fireDrain = false;
  {
    std::lock_guard<std::mutex> lk(mutex_);
    auto it = sockets_.find(id);
    if (it == sockets_.end()) {
      return false;
    }
    SocketInbound* s = it->second.get();
    if (s->outQueue.empty()) {
      return false;
    }
    out = std::move(s->outQueue.front());
    s->outQueue.pop_front();
    if (s->writePaused && s->outQueue.size() <= SocketInbound::kOutLowWater) {
      s->writePaused = false;
      if (writeDrainFn_) {
        drainFn = writeDrainFn_;
        fireDrain = true;
      }
    }
  }
  if (fireDrain && drainFn) {
    // Notifier hops to the JS thread itself (TcpDataBridge); call it
    // outside the registry lock to avoid holding it across the
    // CallInvoker dispatch.
    drainFn(id);
  }
  return true;
}

bool TcpInboundRegistry::waitPopOutbound(int32_t id, OutboundChunk& out) {
  WriteDrainFn drainFn = nullptr;
  bool fireDrain = false;
  {
    std::unique_lock<std::mutex> lk(mutex_);
    for (;;) {
      auto it = sockets_.find(id);
      if (it == sockets_.end()) {
        return false;  // socket unregistered — write thread must exit
      }
      SocketInbound* s = it->second.get();
      if (!s->outQueue.empty()) {
        out = std::move(s->outQueue.front());
        s->outQueue.pop_front();
        if (s->writePaused &&
            s->outQueue.size() <= SocketInbound::kOutLowWater) {
          s->writePaused = false;
          if (writeDrainFn_) {
            drainFn = writeDrainFn_;
            fireDrain = true;
          }
        }
        break;
      }
      // Empty: block until pushOutbound / unregisterSocket notifies.
      // Predicate re-checked each wake (handles spurious wakeups and the
      // unregister-while-waiting race).
      outCv_.wait(lk);
    }
  }
  if (fireDrain && drainFn) {
    drainFn(id);
  }
  return true;
}

}  // namespace venho
