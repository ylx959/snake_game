#pragma once

/// A minimal RFC 6455 WebSocket server on POSIX sockets.
///
/// Transport only - it knows nothing about snake. One thread per connection,
/// which is plenty for a game whose whole state is a few hundred bytes and
/// keeps each session's logic single-threaded and easy to reason about.

#include <atomic>
#include <cstdint>
#include <functional>
#include <mutex>
#include <optional>
#include <string>

namespace snake {

/// One accepted, upgraded connection. Safe to send from a different thread
/// than the one reading; writes are serialized internally.
class WebSocketConnection {
public:
    explicit WebSocketConnection(int fd);
    ~WebSocketConnection();

    WebSocketConnection(const WebSocketConnection&) = delete;
    WebSocketConnection& operator=(const WebSocketConnection&) = delete;

    /// Send one text frame. False if the peer has gone away.
    bool sendText(const std::string& payload);

    /// Block until the next text frame arrives. nullopt once the peer closes.
    /// Control frames (ping/pong/close) are handled here and never surface.
    std::optional<std::string> receiveText();

    void close();
    bool isOpen() const { return open_.load(); }

private:
    bool sendFrame(std::uint8_t opcode, const std::string& payload);
    bool readExactly(void* buffer, std::size_t length);

    int fd_;
    std::atomic<bool> open_{true};
    std::mutex writeMutex_;
};

class WebSocketServer {
public:
    explicit WebSocketServer(std::uint16_t port);

    /// Accept forever, running `onConnection` on its own thread per client.
    /// Throws std::runtime_error if the listening socket cannot be set up.
    void run(const std::function<void(WebSocketConnection&)>& onConnection);

private:
    std::uint16_t port_;
};

}  // namespace snake
