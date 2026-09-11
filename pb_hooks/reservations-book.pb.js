/// <reference path="../pb_data/types.d.ts" />

// POST /api/reservations/book
// Body (JSON): {
//   from_date: "YYYY-MM-DD", to_date: "YYYY-MM-DD",
//   room_id?: "abc", room_type?: "Plus",
//   name: "Guest Name", phone?: "08...", email?: "a@b.c"
// }
// Flow: validate dates -> find-or-create guest -> resolve room (id or
// cheapest available of type) -> dedup same guest+room+dates -> create.
// Returns 201 (created) or 200 with deduplicated:true on retry.

routerAdd("POST", "/api/reservations/book", (e) => {
  const body = new DynamicModel({
    from_date: "",
    to_date: "",
    room_id: "",
    room_type: "",
    name: "",
    phone: "",
    email: "",
  });
  try {
    e.bindBody(body);
  } catch (_) {
    return e.json(400, { message: "Invalid JSON body." });
  }

  const fromDate = (body.from_date || "").trim();
  const toDate = (body.to_date || "").trim();
  const roomIdRaw = (body.room_id || "").trim();
  const roomTypeRaw = (body.room_type || "").trim();
  const nameRaw = (body.name || "").trim();
  const phoneRaw = (body.phone || "").trim();
  const emailRaw = (body.email || "").trim();

  const errors = {};
  if (!fromDate) errors.from_date = "from_date is required (YYYY-MM-DD).";
  if (!toDate) errors.to_date = "to_date is required (YYYY-MM-DD).";
  if (!nameRaw) errors.name = "name is required.";
  if (!phoneRaw && !emailRaw)
    errors.phone = "phone or email is required.";
  if (Object.keys(errors).length > 0) {
    return e.json(400, { message: "Validation failed.", data: errors });
  }

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
  if (!from) errors.from_date = "from_date must be YYYY-MM-DD.";
  if (!to) errors.to_date = "to_date must be YYYY-MM-DD.";
  if (Object.keys(errors).length > 0) {
    return e.json(400, { message: "Validation failed.", data: errors });
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  if (fromDate < todayStr)
    errors.from_date = "from_date must be today or a further day.";
  if (!(toDate > fromDate))
    errors.to_date = "to_date must be a day after from_date.";
  if (Object.keys(errors).length > 0) {
    return e.json(400, { message: "Validation failed.", data: errors });
  }
  if (emailRaw && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw)) {
    return e.json(400, {
      message: "Validation failed.",
      data: { email: "email format is invalid." },
    });
  }

  // --- Find-or-create guest (phone unique, email unique). ---
  let guest = null;
  if (phoneRaw) {
    try {
      guest = $app.findFirstRecordByData("guests", "phone", phoneRaw);
    } catch (_) {
      guest = null;
    }
  }
  if (!guest && emailRaw) {
    try {
      guest = $app.findFirstRecordByData("guests", "email", emailRaw);
    } catch (_) {
      guest = null;
    }
  }
  try {
    if (guest) {
      let dirty = false;
      if (nameRaw && guest.getString("name") !== nameRaw) {
        guest.set("name", nameRaw);
        dirty = true;
      }
      if (phoneRaw && !guest.getString("phone")) {
        guest.set("phone", phoneRaw);
        dirty = true;
      }
      if (emailRaw && !guest.getString("email")) {
        guest.set("email", emailRaw);
        dirty = true;
      }
      if (dirty) $app.save(guest);
    } else {
      const guestsCol = $app.findCollectionByNameOrId("guests");
      guest = new Record(guestsCol);
      guest.set("name", nameRaw);
      if (phoneRaw) guest.set("phone", phoneRaw);
      if (emailRaw) guest.set("email", emailRaw);
      $app.save(guest);
    }
  } catch (err) {
    return e.json(409, {
      message: "Guest contact already exists with different details.",
      data: { phone: phoneRaw || undefined, email: emailRaw || undefined },
    });
  }

  // --- Resolve room. ---
  const fromStart = fromDate + " 00:00:00.000Z";
  const toEnd = toDate + " 23:59:59.999Z";
  const getBookedRoomIds = () => {
    const booked = {};
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
        for (const id of rv) if (id) booked[id] = true;
      } else if (rv) {
        booked[rv] = true;
      } else {
        const rid = r.getString("room");
        if (rid) booked[rid] = true;
      }
    }
    return booked;
  };
  const getTypeOfRoom = (room) => {
    let typeRec = null;
    try {
      typeRec = room.expandedOne("relation");
    } catch (_) {
      typeRec = null;
    }
    if (!typeRec) {
      const rel = room.get("relation");
      const tid = Array.isArray(rel) ? rel[0] : rel || room.getString("relation");
      if (tid) {
        try {
          typeRec = $app.findRecordById("room_types", tid);
        } catch (_) {
          typeRec = null;
        }
      }
    }
    return typeRec;
  };

  // --- Idempotency (before auto-pick): same guest + exact dates ---
  // room_id -> match exact room; room_type -> match same type name;
  // neither -> match any. Prevents AI retries from booking a 2nd room.
  const stayNights = Math.round((to - from) / 86400000);
  try {
    const same = $app.findRecordsByFilter(
      "reservations",
      "main_guest = {:guestId} && from_date <= {:toEnd} && to_date >= {:fromStart}",
      "-created",
      0,
      0,
      { guestId: guest.id, toEnd: toEnd, fromStart: fromStart },
    );
    for (const r of same) {
      const rFrom = r.getString("from_date").substring(0, 10);
      const rTo = r.getString("to_date").substring(0, 10);
      if (rFrom !== fromDate || rTo !== toDate) continue;
      const orv = r.get("room");
      const ids = Array.isArray(orv)
        ? orv
        : orv
          ? [orv]
          : r.getString("room")
            ? [r.getString("room")]
            : [];
      if (ids.length === 0) continue;
      let rRoom = null;
      try {
        rRoom = $app.findRecordById("rooms", ids[0]);
      } catch (_) {
        continue;
      }
      if (roomIdRaw && !ids.includes(roomIdRaw)) continue;
      const rType = getTypeOfRoom(rRoom);
      const rTypeName = rType ? (rType.getString("name") || "").toLowerCase() : "";
      if (roomTypeRaw && rTypeName !== roomTypeRaw.toLowerCase()) continue;
      const rPrice = rType ? rType.get("price") : null;
      return e.json(200, {
        id: r.id,
        deduplicated: true,
        from_date: fromDate,
        to_date: toDate,
        nights: stayNights,
        total_price: rPrice != null ? rPrice * stayNights : null,
        room: {
          id: rRoom.id,
          label: rRoom.getString("label"),
          type: rType
            ? { id: rType.id, name: rType.getString("name"), price: rPrice }
            : null,
        },
        guest: {
          id: guest.id,
          name: guest.getString("name"),
          phone: guest.getString("phone"),
          email: guest.getString("email"),
        },
      });
    }
  } catch (_) {
    // dedup is best-effort; continue to create
  }

  let room = null;
  let typeRec = null;
  try {
    if (roomIdRaw) {
      try {
        room = $app.findRecordById("rooms", roomIdRaw);
      } catch (_) {
        return e.json(404, { message: "room '" + roomIdRaw + "' not found." });
      }
      if (room.getBool("maintenance")) {
        return e.json(409, {
          message: "Room is under maintenance.",
          data: { room_id: room.id },
        });
      }
      const booked = getBookedRoomIds();
      if (booked[room.id]) {
        return e.json(409, {
          message: "Room already booked for the selected dates.",
          data: { room_id: room.id, from_date: fromDate, to_date: toDate },
        });
      }
      typeRec = getTypeOfRoom(room);
    } else {
      // Auto-pick: cheapest available, optionally filtered by type name.
      let typeId = null;
      if (roomTypeRaw) {
        const allTypes = $app.findRecordsByFilter("room_types", "", "", 0, 0);
        const wanted = roomTypeRaw.toLowerCase();
        let matched = null;
        for (const t of allTypes) {
          if ((t.getString("name") || "").toLowerCase() === wanted) {
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
      }
      let rooms = $app.findRecordsByFilter(
        "rooms",
        "maintenance = false",
        "label",
        0,
        0,
      );
      if (typeId) {
        rooms = rooms.filter((rm) => {
          const rel = rm.get("relation");
          if (Array.isArray(rel)) return rel.includes(typeId);
          if (typeof rel === "string") return rel === typeId;
          return rm.getString("relation") === typeId;
        });
      }
      const booked = getBookedRoomIds();
      rooms = rooms.filter((rm) => !booked[rm.id]);
      if (rooms.length === 0) {
        return e.json(409, {
          message: "No rooms available for the selected dates.",
          data: {
            from_date: fromDate,
            to_date: toDate,
            room_type: roomTypeRaw || null,
          },
        });
      }
      try {
        $app.expandRecords(rooms, ["relation"]);
      } catch (_) {}
      // Cheapest first, then label.
      rooms.sort((a, b) => {
        const ta = getTypeOfRoom(a);
        const tb = getTypeOfRoom(b);
        const pa = ta ? ta.get("price") || 0 : 0;
        const pb = tb ? tb.get("price") || 0 : 0;
        if (pa !== pb) return pa - pb;
        const la = a.getString("label") || "";
        const lb = b.getString("label") || "";
        return la < lb ? -1 : la > lb ? 1 : 0;
      });
      room = rooms[0];
      typeRec = getTypeOfRoom(room);
    }
  } catch (err) {
    if (err && err.status) throw err;
    return e.json(500, { message: "Failed to resolve room." });
  }

  // --- Create reservation. ---
  let record = null;
  try {
    const col = $app.findCollectionByNameOrId("reservations");
    record = new Record(col);
    record.set("main_guest", guest.id);
    record.set("room", room.id);
    record.set("from_date", fromStart);
    record.set("to_date", toEnd);
    $app.save(record);
  } catch (err) {
    return e.json(409, {
      message: "Failed to create reservation. Room may have just been booked.",
    });
  }

  const price = typeRec ? typeRec.get("price") : null;
  const nights = Math.round((to - from) / 86400000);
  return e.json(201, {
    id: record.id,
    deduplicated: false,
    from_date: fromDate,
    to_date: toDate,
    nights: nights,
    total_price: price != null ? price * nights : null,
    room: {
      id: room.id,
      label: room.getString("label"),
      type: typeRec
        ? { id: typeRec.id, name: typeRec.getString("name"), price: price }
        : null,
    },
    guest: {
      id: guest.id,
      name: guest.getString("name"),
      phone: guest.getString("phone"),
      email: guest.getString("email"),
    },
  });
});
