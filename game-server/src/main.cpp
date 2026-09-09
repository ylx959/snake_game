/// Server entrypoint.
///
/// Wiring only. The rules live in Game/Snake/Collision, the client protocol in
/// Command, the transport in WebSocketServer. This file's job is to hand each
/// connection its own `Game`, pump commands into it, and push state out at the
/// tick rate.

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
#include <thread>

#include "Command.hpp"
#include "Game.hpp"
#include "WebSocketServer.hpp"

namespace {

constexpr std::uint16_t kDefaultPort = 8000;

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
        // Parse outside the lock: it touches no game state, and holding the
        // mutex while doing string work would stall the ticker for no reason.
        const std::optional<snake::Command> command = snake::parseCommand(*message);
        if (!command) continue;  // unrecognised message: ignore, keep the socket
        std::lock_guard<std::mutex> lock(gameMutex);
        snake::apply(*command, game);
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
