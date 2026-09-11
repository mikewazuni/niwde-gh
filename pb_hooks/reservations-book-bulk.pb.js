/// <reference path="../pb_data/types.d.ts" />

// POST /api/reservations/book-bulk
// Body (JSON): {
//   from_date: "YYYY-MM-DD", to_date: "YYYY-MM-DD",
//   room_type: "Plus", quantity: 2,
//   name: "Guest Name", phone?: "08...", email?: "a@b.c"
// }
// Books N rooms of one type in a single call: one reservation record
// per room (cheapest labels first), one combined total.
// Retry-safe: existing same guest + exact dates + same type rooms
// count toward quantity, returns 200 with deduplicated:true.
// Shortfall rejected with 409 {requested, already_booked, available}.

routerAdd("POST", "/api/reservations/book-bulk", (e) => {
  const body = new DynamicModel({
    from_date: "",
    to_date: "",
    room_type: "",
    // string default: n8n $fromAI sends numbers as strings ("3").
    quantity: "",
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
  const roomTypeRaw = (body.room_type || "").trim();
  const nameRaw = (body.name || "").trim();
  const phoneRaw = (body.phone || "").trim();
  const emailRaw = (body.email || "").trim();

  const errors = {};
  if (!fromDate) errors.from_date = "from_date is required (YYYY-MM-DD).";
  if (!toDate) errors.to_date = "to_date is required (YYYY-MM-DD).";
  if (!roomTypeRaw) errors.room_type = "room_type is required.";
  if (!nameRaw) errors.name = "name is required.";
  if (!phoneRaw && !emailRaw)
    errors.phone = "phone or email is required.";
  let qty = 0;
  const qtyRaw = body.quantity;
  if (qtyRaw === null || qtyRaw === undefined || qtyRaw === "") {
    errors.quantity = "quantity is required (integer 1-10).";
  } else {
    qty = parseInt(qtyRaw, 10);
    if (isNaN(qty) || qty < 1 || qty > 10) {
      errors.quantity = "quantity must be an integer 1-10.";
    }
  }
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

  // --- Find-or-create guest (same rules as single book). ---
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

  // --- Resolve type. ---
  const fromStart = fromDate + " 00:00:00.000Z";
  const toEnd = toDate + " 23:59:59.999Z";
  const allTypes = $app.findRecordsByFilter("room_types", "", "", 0, 0);
  const wanted = roomTypeRaw.toLowerCase();
  let matched = null;
  for (let ti = 0; ti < allTypes.length; ti++) {
    if ((allTypes[ti].getString("name") || "").toLowerCase() === wanted) {
      matched = allTypes[ti];
      break;
    }
  }
  if (!matched) {
    return e.json(400, {
      message: "Validation failed.",
      data: { room_type: "room_type '" + roomTypeRaw + "' not found." },
    });
  }
  const typeId = matched.id;
  const typeName = matched.getString("name");
  const unitPrice = matched.get("price");
  const mNights = Math.round((to - from) / 86400000);

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

  // --- Existing same guest + exact dates + same type (retry-safe). ---
  const haveRooms = [];
  const haveRes = [];
  try {
    const mine = $app.findRecordsByFilter(
      "reservations",
      "main_guest = {:guestId} && from_date <= {:toEnd} && to_date >= {:fromStart}",
      "-created",
      0,
      0,
      { guestId: guest.id, toEnd: toEnd, fromStart: fromStart },
    );
    for (let mi = 0; mi < mine.length; mi++) {
      const r = mine[mi];
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
      const rType = getTypeOfRoom(rRoom);
      const rTypeName = rType ? (rType.getString("name") || "").toLowerCase() : "";
      if (rTypeName !== wanted) continue;
      if (haveRooms.indexOf(ids[0]) === -1) {
        haveRooms.push(ids[0]);
        haveRes.push(r.id);
      }
    }
  } catch (_) {
    // dedup is best-effort; continue to create
  }

  // --- Available rooms of type (label order). ---
  let need = qty - haveRooms.length;
  if (need < 0) need = 0;
  const booked = {};
  try {
    const overlapping = $app.findRecordsByFilter(
      "reservations",
      "from_date <= {:toEnd} && to_date >= {:fromStart}",
      "",
      0,
      0,
      { toEnd: toEnd, fromStart: fromStart },
    );
    for (let oi = 0; oi < overlapping.length; oi++) {
      const rv = overlapping[oi].get("room");
      if (Array.isArray(rv)) {
        for (let k = 0; k < rv.length; k++) if (rv[k]) booked[rv[k]] = true;
      } else if (rv) {
        booked[rv] = true;
      } else {
        const rid = overlapping[oi].getString("room");
        if (rid) booked[rid] = true;
      }
    }
  } catch (err) {
    return e.json(500, { message: "Failed to lookup reservations." });
  }
  let pool = [];
  try {
    pool = $app.findRecordsByFilter("rooms", "maintenance = false", "label", 0, 0);
  } catch (err) {
    return e.json(500, { message: "Failed to resolve rooms." });
  }
  pool = pool.filter((rm) => {
    if (booked[rm.id]) return false;
    if (haveRooms.indexOf(rm.id) !== -1) return false;
    const rel = rm.get("relation");
    if (Array.isArray(rel)) return rel.indexOf(typeId) !== -1;
    if (typeof rel === "string") return rel === typeId;
    return rm.getString("relation") === typeId;
  });
  pool.sort((a, b) => {
    const la = a.getString("label") || "";
    const lb = b.getString("label") || "";
    return la < lb ? -1 : la > lb ? 1 : 0;
  });
  if (pool.length < need) {
    return e.json(409, {
      message: "Not enough rooms available for the selected dates.",
      data: {
        from_date: fromDate,
        to_date: toDate,
        room_type: typeName,
        requested: qty,
        already_booked: haveRooms.length,
        available: pool.length + haveRooms.length,
      },
    });
  }

  // --- Create the shortfall, one reservation per room. ---
  const madeIds = [];
  const madeRooms = [];
  try {
    const col = $app.findCollectionByNameOrId("reservations");
    for (let i = 0; i < need; i++) {
      const rec = new Record(col);
      rec.set("main_guest", guest.id);
      rec.set("room", pool[i].id);
      rec.set("from_date", fromStart);
      rec.set("to_date", toEnd);
      $app.save(rec);
      madeIds.push(rec.id);
      madeRooms.push(pool[i].id);
    }
  } catch (err) {
    return e.json(409, {
      message: "Failed to create reservations. Rooms may have just been booked.",
      data: { requested: qty, created: madeIds },
    });
  }
  const allIds = haveRes.concat(madeIds);
  const allRooms = haveRooms.concat(madeRooms);
  const roomsOut = [];
  for (let k = 0; k < allRooms.length; k++) {
    let rm = null;
    try {
      rm = $app.findRecordById("rooms", allRooms[k]);
    } catch (_) {
      continue;
    }
    roomsOut.push({
      id: rm.id,
      label: rm.getString("label"),
      type: { id: matched.id, name: typeName, price: unitPrice },
    });
  }
  const allCreated = madeIds.length === 0;
  return e.json(allCreated ? 200 : 201, {
    ids: allIds,
    deduplicated: allCreated,
    from_date: fromDate,
    to_date: toDate,
    nights: mNights,
    quantity: allIds.length,
    total_price: unitPrice != null ? unitPrice * mNights * allIds.length : null,
    rooms: roomsOut,
    guest: {
      id: guest.id,
      name: guest.getString("name"),
      phone: guest.getString("phone"),
      email: guest.getString("email"),
    },
  });
});
