# Niwde Guest House API

Human-readable contract for the custom endpoints. Machine-readable requests live in this folder as OpenCollection (`*.yml`, spec: https://spec.opencollection.com/).

Base URL (local): `http://localhost:8190` — replace with your host in production.

## Conventions

- Dates: `YYYY-MM-DD`. `from_date` must be today or later, `to_date` must be after `from_date`.
- `Content-Type: application/json` on all POSTs.
- `room_type` is a `room_types` name, case-insensitive (e.g. `Plus`).
- Status codes: `200` OK / deduplicated, `201` created, `400` validation, `403` contact mismatch, `404` not found, `409` conflict / no availability.

## Room Types

### `GET /api/room-types`

Public price list (`room_types` collection itself is admin-only).

```bash
curl http://localhost:8190/api/room-types
```

Response `200`:

```json
{ "count": 2, "types": [{ "id": "...", "name": "Plus", "price": 200000, "facility": "..." }] }
```

Sorted by `price`. Use for "berapa harga?" questions without dates.

## Rooms

### `POST /api/rooms/available`

List available rooms (`maintenance=false`, no overlapping reservation).

```bash
curl -X POST http://localhost:8190/api/rooms/available \
  -H 'Content-Type: application/json' \
  -d '{"from_date":"2026-09-12","to_date":"2026-09-13"}'
```

Body: `from_date*`, `to_date*`, `room_type?`.

Filter by type:

```bash
curl -X POST http://localhost:8190/api/rooms/available \
  -H 'Content-Type: application/json' \
  -d '{"from_date":"2026-09-12","to_date":"2026-09-13","room_type":"Plus"}'
```

### `POST /api/rooms/available-check`

Per-type availability flags (no counts, no room details). Always covers all room types; no `room_type` filter.

```bash
curl -X POST http://localhost:8190/api/rooms/available-check \
  -H 'Content-Type: application/json' \
  -d '{"from_date":"2026-09-12","to_date":"2026-09-13"}'
```

Body: `from_date*`, `to_date*`.

Response `200`:

```json
{ "from_date": "2026-09-12", "to_date": "2026-09-13", "types": [{ "id": "...", "name": "Plus", "available": true }] }
```

## Reservations

### `POST /api/reservations/book`

Book one room (find-or-create guest, auto-pick cheapest available).

```bash
curl -X POST http://localhost:8190/api/reservations/book \
  -H 'Content-Type: application/json' \
  -d '{"from_date":"2026-09-12","to_date":"2026-09-13","room_type":"Plus","name":"Guest One","phone":"081200000001"}'
```

Body: `from_date*`, `to_date*`, `name*`, `phone` or `email`* (`email` validated if given). Room: `room_id` wins if given, else `room_type`, else cheapest available.

- Retry-safe: same guest + room + dates returns `200 {deduplicated:true}`.
- Overlap / maintenance rejected with `409` (also enforced on direct record create/update).
- Success `201` (or `200` on dedup):

```json
{ "id": "...", "from_date": "2026-09-12", "to_date": "2026-09-13", "nights": 1, "total_price": 200000, "room": { "id": "...", "label": "...", "type": "Plus" }, "guest": { "id": "...", "name": "Guest One", "phone": "081200000001", "email": "" } }
```

Explicit room variant:

```json
{ "from_date": "2026-09-12", "to_date": "2026-09-13", "room_id": "<roomId>", "name": "Jane", "phone": "081200000099" }
```

### `POST /api/reservations/book-bulk`

Book N rooms of one type in a single call (find-or-create guest).

```bash
curl -X POST http://localhost:8190/api/reservations/book-bulk \
  -H 'Content-Type: application/json' \
  -d '{"from_date":"2026-12-01","to_date":"2026-12-03","room_type":"Plus","quantity":2,"name":"Guest One","phone":"081200000001"}'
```

Body: `from_date*`, `to_date*`, `room_type*`, `quantity*` (int 1–10, numeric strings accepted), `name*`, `phone` or `email`*.

- Retry-safe: existing same guest + dates + type rooms count toward `quantity`, returns `200 {deduplicated:true}`.
- Shortfall rejected with `409 {requested, already_booked, available}`.
- Success: `{ids, from_date, to_date, nights, quantity, total_price (combined), rooms[{id,label,type}], guest{id,name,phone,email}}`.

### `POST /api/reservations/lookup`

Receptionist "cek booking saya".

```bash
curl -X POST http://localhost:8190/api/reservations/lookup \
  -H 'Content-Type: application/json' \
  -d '{"phone":"081200000001"}'
```

Body: `{phone?}` / `{email?}` lists all guest bookings, or `{reservation_id}` (+ optional contact check) fetches one. At least one of `phone`, `email`, `reservation_id` required.

- Wrong contact for a `reservation_id` returns `403`.
- Response `200`: `{count, reservations: [{id, from_date, to_date, nights, total_price, room{id,label,type}}]}`.

### `POST /api/reservations/cancel`

Cancel a booking after ownership check.

```bash
curl -X POST http://localhost:8190/api/reservations/cancel \
  -H 'Content-Type: application/json' \
  -d '{"reservation_id":"<reservationId>","phone":"081200000001"}'
```

Body: `reservation_id*`, `phone` or `email`* (must match booking guest). Replace `<reservationId>` with a real id from Book / Lookup.

- Mismatch returns `403`; unknown id returns `404`.
- Response `200`: `{id, cancelled: true, from_date, to_date, room_label}`.
