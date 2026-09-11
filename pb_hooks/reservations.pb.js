/// <reference path="../pb_data/types.d.ts" />

// Shared validation for reservations: date rules, maintenance, no double-booking.
// Applied to Admin UI + API creates/updates so the n8n agent can't overbook.

function validateReservation(record, selfId) {
  const rawFrom = record.getString("from_date") || "";
  const rawTo = record.getString("to_date") || "";
  const fromDate = rawFrom.substring(0, 10);
  const toDate = rawTo.substring(0, 10);

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const parseDay = (s) => {
    if (!DATE_RE.test(s)) return null;
    const d = new Date(s + "T00:00:00.000Z");
    if (isNaN(d.getTime())) return null;
    if (d.toISOString().slice(0, 10) !== s) return null;
    return d;
  };

  const from = parseDay(fromDate);
  const to = parseDay(toDate);
  if (!from || !to) {
    throw new BadRequestError("Invalid reservation dates.", {
      from_date: "from_date must be YYYY-MM-DD.",
      to_date: "to_date must be YYYY-MM-DD.",
    });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  if (fromDate < todayStr) {
    throw new BadRequestError("Validation failed.", {
      from_date: "from_date must be today or a further day.",
    });
  }
  if (!(toDate > fromDate)) {
    throw new BadRequestError("Validation failed.", {
      to_date: "to_date must be a day after from_date.",
    });
  }

  // Collect requested room ids (relation may be string or array).
  const rv = record.get("room");
  let roomIds = [];
  if (Array.isArray(rv)) {
    roomIds = rv.filter((id) => !!id);
  } else if (rv) {
    roomIds = [rv];
  } else {
    const rid = record.getString("room");
    if (rid) roomIds = [rid];
  }
  if (roomIds.length === 0) {
    throw new BadRequestError("Validation failed.", {
      room: "room is required.",
    });
  }

  // Maintenance check.
  for (const rid of roomIds) {
    let room = null;
    try {
      room = $app.findRecordById("rooms", rid);
    } catch (_) {
      throw new BadRequestError("Validation failed.", {
        room: "room '" + rid + "' not found.",
      });
    }
    if (room.getBool("maintenance")) {
      throw new ApiError(409, "Room is under maintenance.", {
        room: "room '" + room.getString("label") + "' is under maintenance.",
      });
    }
  }

  // Overlap check: from_date <= toEnd && to_date >= fromStart.
  const fromStart = fromDate + " 00:00:00.000Z";
  const toEnd = toDate + " 23:59:59.999Z";
  let overlapping = [];
  try {
    overlapping = $app.findRecordsByFilter(
      "reservations",
      "from_date <= {:toEnd} && to_date >= {:fromStart}",
      "",
      0,
      0,
      { toEnd: toEnd, fromStart: fromStart },
    );
  } catch (err) {
    throw new ApiError(500, "Failed to lookup reservations.");
  }

  for (const r of overlapping) {
    if (selfId && r.id === selfId) continue;
    const orv = r.get("room");
    let bookedIds = [];
    if (Array.isArray(orv)) {
      bookedIds = orv;
    } else if (orv) {
      bookedIds = [orv];
    } else {
      const s = r.getString("room");
      if (s) bookedIds = [s];
    }
    for (const rid of roomIds) {
      if (bookedIds.includes(rid)) {
        throw new ApiError(409, "Room already booked for the selected dates.", {
          room: rid,
          from_date: fromDate,
          to_date: toDate,
        });
      }
    }
  }
}

function normalizeReservationDates(record) {
  const from = record.getString("from_date");
  if (from && from.length >= 10) {
    record.set("from_date", from.substring(0, 10) + " 00:00:00.000Z");
  }
  const to = record.getString("to_date");
  if (to && to.length >= 10) {
    record.set("to_date", to.substring(0, 10) + " 23:59:59.999Z");
  }
}

onRecordCreateRequest((e) => {
  normalizeReservationDates(e.record);
  validateReservation(e.record, null);
  e.next();
}, "reservations");

onRecordUpdateRequest((e) => {
  normalizeReservationDates(e.record);
  validateReservation(e.record, e.record.id);
  e.next();
}, "reservations");
