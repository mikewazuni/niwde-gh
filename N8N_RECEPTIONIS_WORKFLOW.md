# N8N Receptionist Workflow

Active workflow: `Receptionist workflow` (`jrd5X0Xeye1AIUei`, active, 18 nodes).

Trigger: Chat Trigger (`@n8n/n8n-nodes-langchain.chatTrigger`, public, responseMode `responseNodes`).

Flow:
`Chat Trigger` -> `SOP` (Set) -> `SOP - Examples` (Set: `for_draft` style examples for the agent, `for_formatter` self-contained bubble patterns for the guardrail) -> `Receptionist Agent` -> `Response Guardrail` (`onError: continueErrorOutput`) -> `Send Bubble 1` (chat) -> `Check Has Question` (If bubble2 notEmpty) -> `Send Bubble 2` (chat, only if question exists). Error branch: `Response Guardrail` retries internally up to 3 attempts with 5s waits (user waits, no re-chat needed); only if all fail, output 2 -> `Fallback Bubbles` (Code, wraps draft text as `bubble1`, `bubble2` empty) -> `Send Bubble 1`, so a parser failure (e.g. exec 92, plain-text tool skip) still sends one reply instead of erroring.

Agents:

- `Receptionist Agent` (agent v3.1, maxIterations 8): system prompt from `SOP.sop_text`, identity Putu, Bahasa Indonesia default, calls tools. Sub-nodes: `Sumopod Chat Model` (lmChatOpenAi, MiniMax-M2.7-highspeed, temp 0.3), `Simple Memory` (buffer window 12), 6 HTTP tools.
- `Response Guardrail` (agent v3.1, maxIterations 2, retry `maxTries: 3` / `waitBetweenTries: 5000`, `onError: continueErrorOutput`): final formatter to `bubble1` (statements only, ends with period) + `bubble2` (single question or empty). Sub-nodes: same model + memory, `Bubble Parser` (structured output `{bubble1, bubble2}`).

PocketBase tools (base `http://niwde-stay-app:8090`):

- `List Room Types` GET `/api/room-types` — prices/facilities, must-call before price answers.
- `Check Availability` POST `/api/rooms/available-check` `{from_date, to_date}` — quick check.
- `Search Available Rooms` POST `/api/rooms/available` `{from_date, to_date, room_type?}` — detail label/price/facility.
- `Book Reservation` POST `/api/reservations/book` `{from_date, to_date, room_type?, room_id?, name, phone?, email?}` — confirm before call, find-or-creates `guests` (see `pb_hooks/reservations-book.pb.js:77-122`), no separate guest tool.
- `Lookup Reservation` POST `/api/reservations/lookup` `{phone?, email?, reservation_id?}`.
- `Cancel Reservation` POST `/api/reservations/cancel` `{reservation_id, phone?, email?}` — confirm before call.

Rules (SOP + Guardrail): source of truth for type names/prices/facilities is the `List Room Types` tool output — nothing hardcoded in SOP (names/prices change in system anytime); templates use `{Type} Rp {price}` placeholders, draft numbers corrected against tool data, never invent facilities. INTRO: perkenalan `saya Putu dari Niwde Stay` max ONCE per conversation — include only if no prior assistant message contains `Putu`, later replies omit it (price template has first/later variants); guardrail strips repeats. NO-REPEAT: never restate prices/facilities/checkinout already stated in history; follow-ups confirm briefly (e.g. the chosen type and price) with facilities only when asked or first presenting types (`for_formatter` rule 7). CHECKINOUT: check-in 14:00 WITA, check-out 12:00 WITA — state on booking success (with `reservation_id`) and when asked, always with WITA. BOOKING: require `from_date, to_date, name` + `phone` (email optional, only if guest wants details by email — never ask otherwise); REUSE FIRST from full history, never re-ask given data; if still missing ask one per reply in order dates, type, name, phone; email only if both phone and email missing; `Book` find-or-creates guest, never claim saved before success. On success state `reservation_id` + check-in/out times, close with `Terima kasih banyak kak, sampai jumpa.`, `bubble2` empty (convo ends, `Send Bubble 2` skipped). Dates YYYY-MM-DD, bare dates written plain with NO `waktu WITA` (`for_formatter` rule 4); WITA only with clock times (CHECKINOUT 14:00/12:00 on booking success or when asked). Pre-booking confirm: `bubble1` statements ending with period (dates plain), `bubble2` the single confirmation question (`for_formatter` rule 6). Plain chat text only, no markdown/emoji, never particle `ya`, max one question per reply, address `kak`. PLAIN WORDS: short everyday Indonesian — `kamar yang tersedia` never `ketersediaan/ketersediaannya`, `kasih tahu` never `menginformasikan`. Tone: halus Javanese-polite Indonesian (lembut, merendah, tidak menggurui; no Bahasa Jawa). Greeting-only -> short greeting, no unprompted info. Booking without type -> ask type first, no availability call. SCOPE: hotel-only (greeting, harga, fasilitas, availability, booking, lookup, cancel); non-hotel incl. coding/script/tugas/general knowledge or hotel words as pretext (e.g. `kode javascript hello world`) -> `SOP.sop_text` exact reply `Maaf, saya tidak bisa membantu.` with no tools/clarification/question, `for_formatter` rule 5 forces `bubble1` exactly that + `bubble2` empty (skips `Send Bubble 2`, saves tokens).

## Maintains this doc

- Just put overview and purpose , don't put too much details
- Drop-in replace things if something needs updating
- This document must be updated whenever the workflow changes
