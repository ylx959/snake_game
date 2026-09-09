cmake_minimum_required(VERSION 3.16)
project(snake_game_server CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()

find_package(Threads REQUIRED)

# The rules of the game, with no transport attached. Tests link against this,
# and so does the server; neither can drift from the other.
add_library(snake_core
  src/Snake.cpp
  src/Collision.cpp
  src/Game.cpp
)
target_include_directories(snake_core PUBLIC include)
target_compile_options(snake_core PRIVATE -Wall -Wextra -Wpedantic)

add_executable(game-server
  src/main.cpp
  src/WebSocketServer.cpp
)
target_link_libraries(game-server PRIVATE snake_core Threads::Threads)
target_compile_options(game-server PRIVATE -Wall -Wextra -Wpedantic)

enable_testing()
add_executable(core_tests tests/core_tests.cpp)
target_link_libraries(core_tests PRIVATE snake_core)
target_compile_options(core_tests PRIVATE -Wall -Wextra -Wpedantic)
add_test(NAME core_tests COMMAND core_tests)
