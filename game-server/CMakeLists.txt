cmake_minimum_required(VERSION 3.16)
project(snake_game_server CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()

find_package(Threads REQUIRED)

# Dependencies are fetched at configure time rather than expected on the system,
# so a fresh clone needs nothing but CMake, a compiler and network access once.
include(FetchContent)
set(FETCHCONTENT_QUIET OFF)

# Release archives, not git clones: nlohmann/json's repository carries hundreds
# of megabytes of test fixtures, and neither is needed to build against.
FetchContent_Declare(nlohmann_json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
  URL_HASH SHA256=d6c65aca6b1ed68e7a182f4757257b107ae403032760ed6ef121c9d55e81757d
)
FetchContent_Declare(Catch2
  URL https://github.com/catchorg/Catch2/archive/refs/tags/v3.7.1.tar.gz
  URL_HASH SHA256=c991b247a1a0d7bb9c39aa35faf0fe9e19764213f28ffba3109388e62ee0269c
)
FetchContent_MakeAvailable(nlohmann_json Catch2)

# The rules of the game, with no transport attached. Tests link against this,
# and so does the server; neither can drift from the other.
add_library(snake_core
  src/Snake.cpp
  src/Collision.cpp
  src/Game.cpp
  src/Command.cpp
)
target_include_directories(snake_core PUBLIC include)
target_link_libraries(snake_core PRIVATE nlohmann_json::nlohmann_json)
target_compile_options(snake_core PRIVATE -Wall -Wextra -Wpedantic)

add_executable(game-server
  src/main.cpp
  src/WebSocketServer.cpp
)
target_link_libraries(game-server PRIVATE snake_core Threads::Threads)
target_compile_options(game-server PRIVATE -Wall -Wextra -Wpedantic)

enable_testing()
add_executable(core_tests tests/core_tests.cpp)
# nlohmann is PRIVATE to snake_core (no public header exposes it), so the tests
# link it themselves to assert on the serialized wire format.
target_link_libraries(core_tests PRIVATE snake_core Catch2::Catch2WithMain nlohmann_json::nlohmann_json)
target_compile_options(core_tests PRIVATE -Wall -Wextra -Wpedantic)

# Registers every TEST_CASE with CTest individually, so `ctest -R` and
# `./core_tests "[snake]"` can select a single case.
list(APPEND CMAKE_MODULE_PATH ${catch2_SOURCE_DIR}/extras)
include(Catch)
catch_discover_tests(core_tests)
