#include "WebSocketServer.hpp"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <unistd.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <cstring>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <thread>
#include <vector>

namespace snake {
namespace {

// The GUID every RFC 6455 handshake appends to the client key before hashing.
constexpr std::string_view kHandshakeGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

constexpr std::uint8_t kOpcodeText = 0x1;
constexpr std::uint8_t kOpcodeClose = 0x8;
constexpr std::uint8_t kOpcodePing = 0x9;
constexpr std::uint8_t kOpcodePong = 0xA;

/// SHA-1 (RFC 3174). Only needed for the handshake, so it is inlined here
/// rather than pulling in a crypto dependency for twenty bytes of digest.
std::array<std::uint8_t, 20> sha1(const std::string& input) {
    std::uint32_t h[5] = {0x67452301u, 0xEFCDAB89u, 0x98BADCFEu, 0x10325476u, 0xC3D2E1F0u};

    std::vector<std::uint8_t> message(input.begin(), input.end());
    const std::uint64_t bitLength = static_cast<std::uint64_t>(input.size()) * 8;
    message.push_back(0x80);
    while (message.size() % 64 != 56) message.push_back(0x00);
    for (int i = 7; i >= 0; --i) {
        message.push_back(static_cast<std::uint8_t>((bitLength >> (i * 8)) & 0xFF));
    }

    const auto rotate = [](std::uint32_t value, int bits) {
        return (value << bits) | (value >> (32 - bits));
    };

    for (std::size_t chunk = 0; chunk < message.size(); chunk += 64) {
        std::uint32_t w[80];
        for (int i = 0; i < 16; ++i) {
            w[i] = (static_cast<std::uint32_t>(message[chunk + i * 4]) << 24) |
                   (static_cast<std::uint32_t>(message[chunk + i * 4 + 1]) << 16) |
                   (static_cast<std::uint32_t>(message[chunk + i * 4 + 2]) << 8) |
                   (static_cast<std::uint32_t>(message[chunk + i * 4 + 3]));
        }
        for (int i = 16; i < 80; ++i) {
            w[i] = rotate(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
        }

        std::uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
        for (int i = 0; i < 80; ++i) {
            std::uint32_t f = 0;
            std::uint32_t k = 0;
            if (i < 20)      { f = (b & c) | (~b & d);            k = 0x5A827999u; }
            else if (i < 40) { f = b ^ c ^ d;                     k = 0x6ED9EBA1u; }
            else if (i < 60) { f = (b & c) | (b & d) | (c & d);   k = 0x8F1BBCDCu; }
            else             { f = b ^ c ^ d;                     k = 0xCA62C1D6u; }

            const std::uint32_t temp = rotate(a, 5) + f + e + k + w[i];
            e = d; d = c; c = rotate(b, 30); b = a; a = temp;
        }
        h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e;
    }

    std::array<std::uint8_t, 20> digest{};
    for (int i = 0; i < 5; ++i) {
        digest[i * 4]     = static_cast<std::uint8_t>((h[i] >> 24) & 0xFF);
        digest[i * 4 + 1] = static_cast<std::uint8_t>((h[i] >> 16) & 0xFF);
        digest[i * 4 + 2] = static_cast<std::uint8_t>((h[i] >> 8) & 0xFF);
        digest[i * 4 + 3] = static_cast<std::uint8_t>(h[i] & 0xFF);
    }
    return digest;
}

std::string base64(const std::uint8_t* data, std::size_t length) {
    static constexpr char kAlphabet[] =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    std::string out;
    out.reserve(((length + 2) / 3) * 4);
    for (std::size_t i = 0; i < length; i += 3) {
        const std::uint32_t remaining = static_cast<std::uint32_t>(length - i);
        const std::uint32_t block = (static_cast<std::uint32_t>(data[i]) << 16) |
                                    (remaining > 1 ? static_cast<std::uint32_t>(data[i + 1]) << 8 : 0) |
                                    (remaining > 2 ? static_cast<std::uint32_t>(data[i + 2]) : 0);
        out += kAlphabet[(block >> 18) & 0x3F];
        out += kAlphabet[(block >> 12) & 0x3F];
        out += remaining > 1 ? kAlphabet[(block >> 6) & 0x3F] : '=';
        out += remaining > 2 ? kAlphabet[block & 0x3F] : '=';
    }
    return out;
}

std::string trim(std::string value) {
    const auto notSpace = [](unsigned char c) { return !std::isspace(c); };
    value.erase(value.begin(), std::find_if(value.begin(), value.end(), notSpace));
    value.erase(std::find_if(value.rbegin(), value.rend(), notSpace).base(), value.end());
    return value;
}

std::string lowercase(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return value;
}

/// Read the request head, up to and including the blank line. Empty on failure.
std::string readHttpRequest(int fd) {
    std::string request;
    std::array<char, 1024> buffer{};
    while (request.find("\r\n\r\n") == std::string::npos) {
        const ssize_t got = ::recv(fd, buffer.data(), buffer.size(), 0);
        if (got <= 0) return {};
        request.append(buffer.data(), static_cast<std::size_t>(got));
        if (request.size() > 16 * 1024) return {};  // no legitimate handshake is this big
    }
    return request;
}

bool sendAll(int fd, const char* data, std::size_t length) {
    std::size_t sent = 0;
    while (sent < length) {
        const ssize_t wrote = ::send(fd, data + sent, length - sent, 0);
        if (wrote <= 0) return false;
        sent += static_cast<std::size_t>(wrote);
    }
    return true;
}

/// Perform the upgrade. False means the socket was answered (or rejected) and
/// should simply be closed by the caller.
bool upgradeToWebSocket(int fd) {
    const std::string request = readHttpRequest(fd);
    if (request.empty()) return false;

    std::istringstream stream(request);
    std::string line;
    std::getline(stream, line);
    const std::string requestLine = trim(line);

    std::string key;
    while (std::getline(stream, line) && trim(line) != "") {
        const std::size_t colon = line.find(':');
        if (colon == std::string::npos) continue;
        if (lowercase(trim(line.substr(0, colon))) == "sec-websocket-key") {
            key = trim(line.substr(colon + 1));
        }
    }

    if (key.empty()) {
        // Not a WebSocket upgrade. `/health` is worth answering so a deploy or
        // a dev script can check the server is alive without opening a socket.
        const bool healthy = requestLine.rfind("GET /health", 0) == 0;
        const std::string body = healthy ? R"({"status":"ok"})" : R"({"error":"expected a websocket upgrade"})";
        const std::string response =
            std::string("HTTP/1.1 ") + (healthy ? "200 OK" : "400 Bad Request") + "\r\n" +
            "Content-Type: application/json\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Content-Length: " + std::to_string(body.size()) + "\r\n"
            "Connection: close\r\n\r\n" + body;
        sendAll(fd, response.data(), response.size());
        return false;
    }

    const auto digest = sha1(key + std::string(kHandshakeGuid));
    const std::string accept = base64(digest.data(), digest.size());

    const std::string response =
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Accept: " + accept + "\r\n\r\n";
    return sendAll(fd, response.data(), response.size());
}

}  // namespace

WebSocketConnection::WebSocketConnection(int fd) : fd_(fd) {}

WebSocketConnection::~WebSocketConnection() {
    close();
    if (fd_ >= 0) ::close(fd_);
}

bool WebSocketConnection::readExactly(void* buffer, std::size_t length) {
    auto* out = static_cast<std::uint8_t*>(buffer);
    std::size_t read = 0;
    while (read < length) {
        const ssize_t got = ::recv(fd_, out + read, length - read, 0);
        if (got <= 0) return false;
        read += static_cast<std::size_t>(got);
    }
    return true;
}

bool WebSocketConnection::sendFrame(std::uint8_t opcode, const std::string& payload) {
    if (!open_.load()) return false;

    std::string frame;
    frame += static_cast<char>(0x80 | opcode);  // FIN + opcode

    // Server-to-client frames are never masked.
    const std::size_t size = payload.size();
    if (size < 126) {
        frame += static_cast<char>(size);
    } else if (size <= 0xFFFF) {
        frame += static_cast<char>(126);
        frame += static_cast<char>((size >> 8) & 0xFF);
        frame += static_cast<char>(size & 0xFF);
    } else {
        frame += static_cast<char>(127);
        for (int i = 7; i >= 0; --i) {
            frame += static_cast<char>((static_cast<std::uint64_t>(size) >> (i * 8)) & 0xFF);
        }
    }
    frame += payload;

    std::lock_guard<std::mutex> lock(writeMutex_);
    if (!sendAll(fd_, frame.data(), frame.size())) {
        open_.store(false);
        return false;
    }
    return true;
}

bool WebSocketConnection::sendText(const std::string& payload) {
    return sendFrame(kOpcodeText, payload);
}

std::optional<std::string> WebSocketConnection::receiveText() {
    while (open_.load()) {
        std::uint8_t header[2];
        if (!readExactly(header, 2)) break;

        const std::uint8_t opcode = header[0] & 0x0F;
        const bool masked = (header[1] & 0x80) != 0;
        std::uint64_t length = header[1] & 0x7F;

        if (length == 126) {
            std::uint8_t extended[2];
            if (!readExactly(extended, 2)) break;
            length = (static_cast<std::uint64_t>(extended[0]) << 8) | extended[1];
        } else if (length == 127) {
            std::uint8_t extended[8];
            if (!readExactly(extended, 8)) break;
            length = 0;
            for (std::uint8_t byte : extended) length = (length << 8) | byte;
        }

        // A client frame that large is either broken or hostile; either way we
        // cannot resynchronise the stream, so drop the connection.
        if (length > 1u << 20) break;

        std::uint8_t mask[4] = {0, 0, 0, 0};
        if (masked && !readExactly(mask, 4)) break;

        std::string payload(static_cast<std::size_t>(length), '\0');
        if (length > 0 && !readExactly(payload.data(), payload.size())) break;
        if (masked) {
            for (std::size_t i = 0; i < payload.size(); ++i) {
                payload[i] = static_cast<char>(static_cast<std::uint8_t>(payload[i]) ^ mask[i % 4]);
            }
        }

        switch (opcode) {
            case kOpcodeText:
                return payload;
            case kOpcodePing:
                sendFrame(kOpcodePong, payload);
                break;
            case kOpcodePong:
                break;
            case kOpcodeClose:
                sendFrame(kOpcodeClose, "");
                open_.store(false);
                return std::nullopt;
            default:
                break;  // binary and continuation frames are not part of this protocol
        }
    }

    open_.store(false);
    return std::nullopt;
}

void WebSocketConnection::close() {
    if (open_.exchange(false)) {
        // Wake a blocked reader on the other thread.
        ::shutdown(fd_, SHUT_RDWR);
    }
}

WebSocketServer::WebSocketServer(std::uint16_t port) : port_(port) {}

void WebSocketServer::run(const std::function<void(WebSocketConnection&)>& onConnection) {
    const int listener = ::socket(AF_INET, SOCK_STREAM, 0);
    if (listener < 0) throw std::runtime_error("could not create a socket");

    int reuse = 1;
    ::setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));

    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    address.sin_port = htons(port_);

    if (::bind(listener, reinterpret_cast<sockaddr*>(&address), sizeof(address)) < 0) {
        ::close(listener);
        throw std::runtime_error("port " + std::to_string(port_) + " is already in use");
    }
    if (::listen(listener, 16) < 0) {
        ::close(listener);
        throw std::runtime_error("could not listen on port " + std::to_string(port_));
    }

    std::cout << "game-server listening on ws://127.0.0.1:" << port_ << "/ws" << std::endl;

    while (true) {
        const int client = ::accept(listener, nullptr, nullptr);
        if (client < 0) continue;

        int nodelay = 1;
        ::setsockopt(client, IPPROTO_TCP, TCP_NODELAY, &nodelay, sizeof(nodelay));

        std::thread([client, &onConnection] {
            if (!upgradeToWebSocket(client)) {
                ::close(client);
                return;
            }
            WebSocketConnection connection(client);  // takes ownership of the fd
            onConnection(connection);
        }).detach();
    }
}

}  // namespace snake
