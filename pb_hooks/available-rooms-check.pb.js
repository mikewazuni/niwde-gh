/// <reference path="../pb_data/types.d.ts" />

// POST /api/rooms/available-check
// Body (JSON): { from_date: "YYYY-MM-DD", to_date: "YYYY-MM-DD" }
// Returns per-type availability flags (no counts, no room details).

routerAdd("POST", "/api/rooms/available-check", (e) => {
  const body = new DynamicModel({
    from_date: "",
    to_date: "",
  });
  try {
    e.bindBody(body);
  } catch (_) {
    return e.json(400, { message: "Invalid JSON body." });
  }

  const fromDate = (body.from_date || "").trim();
  const toDate = (body.to_date || "").trim();

  const errors = {};
  if (!fromDate) errors.from_date = "from_date is required (YYYY-MM-DD).";
  if (!toDate) errors.to_date = "to_date is required (YYYY-MM-DD).";
  if (Object.keys(errors).length > 0) {
    return e.json(400, { message: "Validation failed.", data: errors });
  }

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const parseDay = (s) => {
    if (!DATE_RE.test(s)) return null;
    const d = new Date(s + "T00:00:00.000Z");
    if (isNaN(d.getTime())) return null;
    // Reject overflow like 2026-02-30 -> 2026-03-02.
    if (d.toISOString().slice(0, 10) !== s) return null;
    return d;
  };

  const from = parseDay(fromDate);
  const to = parseDay(toDate);
  if (!from) errors.from_date = "from_date must be YYYY-MM-DD.";
  if (!to) errors.to_date = "to_date must be YYYY-MM-DD.";
  if (Object.keys(errors).length > 0) {
    return e.json(400, { message: "Validation failed.", data: errors });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  if (fromDate < todayStr) {
    errors.from_date = "from_date must be today or a further day.";
  }
  if (!(toDate > fromDate)) {
    errors.to_date = "to_date must be a day after from_date.";
  }
  if (Object.keys(errors).length > 0) {
    return e.json(400, { message: "Validation failed.", data: errors });
  }

  let allTypes = [];
  try {
    allTypes = $app.findRecordsByFilter("room_types", "", "name", 0, 0);
  } catch (err) {
    return e.json(500, { message: "Failed to lookup room types." });
  }

  let rooms = [];
  try {
    rooms = $app.findRecordsByFilter("rooms", "maintenance = false", "label", 0, 0);
  } catch (err) {
    return e.json(500, { message: "Failed to lookup rooms." });
  }

  // Overlapping reservations: from_date <= to_end && to_date >= from_start.
  const fromStart = fromDate + " 00:00:00.000Z";
  const toEnd = toDate + " 23:59:59.999Z";
  let bookedRoomIds = {};
  try {
    const overlapping = $app.findRecordsByFilter(
      "reservations",
      "from_date <= {:toEnd} && to_date >= {:fromStart}",
      "",
      0,
      0,
      { toEnd: toEnd, fromStart: fromStart },
    );
    for (const r of overlapping) {
      const rv = r.get("room");
      if (Array.isArray(rv)) {
        for (const id of rv) {
          if (id) bookedRoomIds[id] = true;
        }
      } else if (rv) {
        bookedRoomIds[rv] = true;
      } else {
        const rid = r.getString("room");
        if (rid) bookedRoomIds[rid] = true;
      }
    }
  } catch (err) {
    return e.json(500, { message: "Failed to lookup reservations." });
  }

  // typeId -> true if at least one non-maintenance, non-booked room exists.
  const hasAvailable = {};
  for (const room of rooms) {
    if (bookedRoomIds[room.id]) continue;
    const rel = room.get("relation");
    if (Array.isArray(rel)) {
      for (const tid of rel) {
        if (tid) hasAvailable[tid] = true;
      }
    } else {
      const tid = room.getString("relation");
      if (tid) hasAvailable[tid] = true;
    }
  }

  const types = [];
  for (const t of allTypes) {
    types.push({
      id: t.id,
      name: t.getString("name"),
      available: hasAvailable[t.id] === true,
    });
  }

  return e.json(200, {
    from_date: fromDate,
    to_date: toDate,
    types: types,
  });
});
