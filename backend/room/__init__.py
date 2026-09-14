"""Rooms: who is playing together, who is in charge, and what the round is doing.

Everything in here is synchronous. A room is a state machine driven by method
calls, so its whole lifecycle is testable without an event loop; the only
asynchronous part of a room is the clock that calls `tick()`, which lives in
`room.clock`.
"""
