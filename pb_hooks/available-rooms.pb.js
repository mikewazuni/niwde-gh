/// <reference path="../pb_data/types.d.ts" />

// POST /api/rooms/available
// Body (JSON): { from_date: "YYYY-MM-DD", to_date: "YYYY-MM-DD", room_type?: "Name" }
// Returns available rooms (maintenance=false, no overlapping reservation).

routerAdd("POST", "/api/rooms/available", (e) => {
  const body = new DynamicModel({
    from_date: "",
    to_date: "",
    room_type: "",
  });
  try {
    e.bindBody(body);
  } catch (_) {
    return e.json(400, { message: "Invalid JSON body." });
  }

  const fromDate = (body.from_date || "").trim();
  const toDate = (body.to_date || "").trim();
  const roomTypeRaw = (body.room_type || "").trim();

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

  // Resolve optional room_type by name (case-insensitive).
  let typeId = null;
  let typeName = null;
  if (roomTypeRaw) {
    let allTypes = [];
    try {
      allTypes = $app.findRecordsByFilter("room_types", "", "", 0, 0);
    } catch (err) {
      return e.json(500, { message: "Failed to lookup room types." });
    }
    const wanted = roomTypeRaw.toLowerCase();
    let matched = null;
    for (const t of allTypes) {
      const n = (t.getString("name") || "").toLowerCase();
      if (n === wanted) {
        matched = t;
        break;
      }
    }
    if (!matched) {
      return e.json(400, {
        message: "Validation failed.",
        data: { room_type: "room_type '" + roomTypeRaw + "' not found." },
      });
    }
    typeId = matched.id;
    typeName = matched.getString("name");
  }

  // Candidate rooms: exclude maintenance, optionally filter by type.
  // Note: rooms.relation allows multiple values, so filter by type in JS
  // to cover both single-id and array shapes.
  let rooms = [];
  try {
    rooms = $app.findRecordsByFilter("rooms", "maintenance = false", "label", 0, 0);
  } catch (err) {
    return e.json(500, { message: "Failed to lookup rooms." });
  }

  if (typeId) {
    rooms = rooms.filter((room) => {
      const rel = room.get("relation");
      if (Array.isArray(rel)) return rel.includes(typeId);
      if (typeof rel === "string") return rel === typeId;
      return room.getString("relation") === typeId;
    });
  }

  if (rooms.length === 0) {
    return e.json(200, {
      from_date: fromDate,
      to_date: toDate,
      room_type: typeName || roomTypeRaw || null,
      count: 0,
      rooms: [],
    });
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

  const available = [];
  for (const room of rooms) {
    if (bookedRoomIds[room.id]) continue;
    available.push(room);
  }

  try {
    $app.expandRecords(available, ["relation"]);
  } catch (_) {
    // expand is best-effort; fallback to direct lookup below
  }

  const result = [];
  for (const room of available) {
    let typeRec = null;
    try {
      typeRec = room.expandedOne("relation");
    } catch (_) {
      typeRec = null;
    }
    if (!typeRec) {
      const tid = room.getString("relation");
      if (tid) {
        try {
          typeRec = $app.findRecordById("room_types", tid);
        } catch (_) {
          typeRec = null;
        }
      }
    }
    const price = typeRec ? typeRec.get("price") : null;
    result.push({
      id: room.id,
      name: room.getString("label"),
      label: room.getString("label"),
      type: typeRec
        ? { id: typeRec.id, name: typeRec.getString("name"), price: price }
        : null,
      price: price,
      facility: typeRec ? typeRec.getString("facility") : "",
    });
  }

  return e.json(200, {
    from_date: fromDate,
    to_date: toDate,
    room_type: typeName || roomTypeRaw || null,
    count: result.length,
    rooms: result,
  });
});
