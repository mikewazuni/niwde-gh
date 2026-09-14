# N8N Receptionist Workflow

Purpose: Putu, Niwde Stay receptionist in Bahasa Indonesia via webchat + Telegram. Handles greeting, prices, facilities, availability, booking, lookup, cancel. Hotel-only scope.

Active workflow: `Receptionist workflow` (`jrd5X0Xeye1AIUei`, active, 41 nodes).

Flow:

1. Triggers (Chat + Telegram) normalize to unified `chatInput` / `sessionId`.
2. `Input Guard` blocks non-hotel / injection with fixed refusal, otherwise continue.
3. Load persistent `guest_profiles` + live room types, then `Receptionist Agent` answers with PocketBase tools.
4. Agent draft saved to guest profile; `Response Formatter` splits reply to bubble1/2/3.
5. `Response Guardrail` final check, then send bubbles per channel (webchat / Telegram).

Agents:

- `Input Guard` — stateless scope filter, no tools/memory.
- `Receptionist Agent` — main agent (Putu) with shared conversation memory.
- `Response Formatter` — formats reply to 1-3 short bubbles.
- `Response Guardrail` — deterministic style/safety check, no LLM.

PocketBase tools:

- List Room Types, Check Availability, Search Available Rooms, Book / Book Bulk, Lookup, Cancel.

Key rules:

- Live tool data is source of truth for names/prices/facilities.
- Putu intro once per conversation; never repeat stated info.
- Check-in 14:00 WITA, check-out 12:00 WITA.
- Booking needs dates + name + phone; reuse known data, confirm before booking.
- Guest data persists via internal PROFILE line + `guest_profiles` table.
- Plain chat text, address `kak`, max one question in last bubble.

## Maintains this doc

- Just put overview and purpose, don't put too much details
- Drop-in replace things if something needs updating
- This document must be updated whenever the workflow changes
