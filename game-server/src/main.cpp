/// Server entrypoint.
///
/// Transport only. Every rule of the game lives in Game/Snake/Collision; this
/// file's job is to hand each WebSocket connection its own `Game`, feed it
/// commands, and push the resulting state out at the tick rate.

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstdlib>
#include <exception>
#include <iostream>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <thread>

#include "Game.hpp"
#include "WebSocketServer.hpp"

namespace {

constexpr std::uint16_t kDefaultPort = 8000;

/// Pull a string field out of a flat JSON object.
///
/// The client only ever sends small machine-generated messages such as
/// `{"type":"turn","direction":"UP"}`, so this is deliberately not a general
/// JSON parser - it finds the key and returns the quoted value after it.
std::optional<std::string> jsonString(std::string_view json, std::string_view key) {
    const std::string needle = "\"" + std::string(key) + "\"";
    const std::size_t at = json.find(needle);
    if (at == std::string_view::npos) return std::nullopt;

    std::size_t cursor = json.find(':', at + needle.size());
    if (cursor == std::string_view::npos) return std::nullopt;

    const std::size_t open = json.find('"', cursor);
    if (open == std::string_view::npos) return std::nullopt;
    const std::size_t close = json.find('"', open + 1);
    if (close == std::string_view::npos) return std::nullopt;

    return std::string(json.substr(open + 1, close - open - 1));
}

/// Translate one client message into a call on the game.
void applyCommand(snake::Game& game, std::string_view message) {
    const std::optional<std::string> type = jsonString(message, "type");
    if (!type) return;

    if (*type == "turn") {
        const std::optional<std::string> name = jsonString(message, "direction");
        if (!name) return;
        // An unknown direction is ignored rather than killing the socket.
        if (const auto direction = snake::directionFromName(*name)) {
            game.turn(*direction);
        }
    } else if (*type == "start") {
        game.start();
    } else if (*type == "pause") {
        game.togglePause();
    } else if (*type == "reset") {
        game.reset();
    }
}

/// One player's session: a game, a clock pushing state, and a command pump.
void runSession(snake::WebSocketConnection& connection) {
    snake::Game game;

    std::mutex gameMutex;
    std::mutex wakeMutex;
    std::condition_variable wake;
    std::atomic<bool> running{true};

    {
        std::lock_guard<std::mutex> lock(gameMutex);
        if (!connection.sendText(game.toJson())) return;
    }

    // The server-side clock. This is the only place state advances.
    std::thread ticker([&] {
        const auto interval = std::chrono::duration<double>(game.tickSeconds());
        while (running.load()) {
            std::string state;
            {
                std::lock_guard<std::mutex> lock(gameMutex);
                game.tick();
                state = game.toJson();
            }
            if (!connection.sendText(state)) break;

            // Waiting on the flag rather than sleeping means a disconnect ends
            // the thread at once instead of one tick later.
            std::unique_lock<std::mutex> lock(wakeMutex);
            wake.wait_for(lock, interval, [&] { return !running.load(); });
        }
        running.store(false);
    });

    while (const std::optional<std::string> message = connection.receiveText()) {
        std::lock_guard<std::mutex> lock(gameMutex);
        applyCommand(game, *message);
    }

    running.store(false);
    wake.notify_all();
    connection.close();
    ticker.join();
}

std::uint16_t portFromEnvironment() {
    if (const char* value = std::getenv("PORT")) {
        const int parsed = std::atoi(value);
        if (parsed > 0 && parsed < 65536) return static_cast<std::uint16_t>(parsed);
        std::cerr << "ignoring invalid PORT=" << value << "\n";
    }
    return kDefaultPort;
}

}  // namespace

int main() {
    try {
        snake::WebSocketServer server(portFromEnvironment());
        server.run(runSession);
    } catch (const std::exception& error) {
        std::cerr << "game-server failed to start: " << error.what() << "\n";
        return 1;
    }
    return 0;
}
