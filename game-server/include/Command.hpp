#pragma once

/// The browser -> server half of the wire contract.
///
/// Parsing is deliberately separate from applying: `parseCommand` is a pure
/// function from text to a value, so it can be tested without a Game, a socket,
/// or a thread. `apply` is then small enough to read at a glance.
///
/// The messages come straight off a socket, so malformed input is an expected
/// case: `parseCommand` never throws and reports every rejection the same way.
///
/// Keep the accepted messages in sync with `ClientMessage` in web/types/game.ts.

#include <optional>
#include <string_view>

#include "Snake.hpp"

namespace snake {

class Game;

/// Everything the browser is allowed to ask for.
struct Command {
    enum class Kind { Turn, Start, Pause, Reset };

    Kind kind{};
    /// Only meaningful when `kind == Kind::Turn`.
    Direction direction{Direction::Right};

    friend bool operator==(const Command&, const Command&) = default;
};

/// Parse one client message, e.g. `{"type":"turn","direction":"UP"}`.
///
/// Returns nullopt for anything unrecognised - an unknown type, a missing or
/// invalid direction, or malformed text. A bad message is ignored rather than
/// killing the socket, so this never throws.
std::optional<Command> parseCommand(std::string_view json);

/// Run a parsed command against a game.
void apply(const Command& command, Game& game);

}  // namespace snake
