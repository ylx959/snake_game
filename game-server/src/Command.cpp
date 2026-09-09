#include "Command.hpp"

#include <string>

#include <nlohmann/json.hpp>

#include "Game.hpp"

namespace snake {

std::optional<Command> parseCommand(std::string_view json) {
    // Non-throwing parse: the input arrives straight off a socket, so malformed
    // text is an expected case, not an exceptional one.
    const nlohmann::json message =
        nlohmann::json::parse(json, /*cb=*/nullptr, /*allow_exceptions=*/false);
    if (!message.is_object()) return std::nullopt;

    const auto type = message.find("type");
    if (type == message.end() || !type->is_string()) return std::nullopt;
    const std::string kind = type->get<std::string>();

    if (kind == "turn") {
        const auto name = message.find("direction");
        if (name == message.end() || !name->is_string()) return std::nullopt;
        const std::optional<Direction> direction =
            directionFromName(name->get<std::string>());
        if (!direction) return std::nullopt;
        return Command{Command::Kind::Turn, *direction};
    }
    if (kind == "start") return Command{Command::Kind::Start, {}};
    if (kind == "pause") return Command{Command::Kind::Pause, {}};
    if (kind == "reset") return Command{Command::Kind::Reset, {}};

    return std::nullopt;
}

void apply(const Command& command, Game& game) {
    switch (command.kind) {
        case Command::Kind::Turn:  game.turn(command.direction); break;
        case Command::Kind::Start: game.start(); break;
        case Command::Kind::Pause: game.togglePause(); break;
        case Command::Kind::Reset: game.reset(); break;
    }
}

}  // namespace snake
