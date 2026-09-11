/// <reference path="../pb_data/types.d.ts" />

// POST /api/reservations/lookup
// Body (JSON): { phone?: "08...", email?: "a@b.c", reservation_id?: "abc" }
// Returns the guest's reservations (front-office "cek booking saya").
// reservation_id alone fetches one booking; phone/email list all theirs.

routerAdd("POST", "/api/reservations/lookup", (e) => {
  const body = new DynamicModel({
    phone: "",
    email: "",
    reservation_id: "",
  });
  try {
    e.bindBody(body);
  } catch (_) {
    return e.json(400, { message: "Invalid JSON body." });
  }

  const phoneRaw = (body.phone || "").trim();
  const emailRaw = (body.email || "").trim();
  const idRaw = (body.reservation_id || "").trim();
  if (!phoneRaw && !emailRaw && !idRaw) {
    return e.json(400, {
      message: "Validation failed.",
      data: { phone: "phone, email, or reservation_id is required." },
    });
  }

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
  const serialize = (r) => {
    const fromDate = r.getString("from_date").substring(0, 10);
    const toDate = r.getString("to_date").substring(0, 10);
    let room = null;
    try {
      const rv = r.get("room");
      const rid = Array.isArray(rv) ? rv[0] : rv || r.getString("room");
      if (rid) room = $app.findRecordById("rooms", rid);
    } catch (_) {
      room = null;
    }
    const typeRec = room ? getTypeOfRoom(room) : null;
    const price = typeRec ? typeRec.get("price") : null;
    const ms =
      new Date(toDate + "T00:00:00.000Z") - new Date(fromDate + "T00:00:00.000Z");
    const nights = Math.round(ms / 86400000);
    return {
      id: r.id,
      from_date: fromDate,
      to_date: toDate,
      nights: nights,
      total_price: price != null ? price * nights : null,
      room: room
        ? {
            id: room.id,
            label: room.getString("label"),
            type: typeRec
              ? {
                  id: typeRec.id,
                  name: typeRec.getString("name"),
                  price: price,
                }
              : null,
          }
        : null,
    };
  };

  // Single booking by id, with optional ownership check.
  if (idRaw) {
    let r = null;
    try {
      r = $app.findRecordById("reservations", idRaw);
    } catch (_) {
      return e.json(404, { message: "Reservation '" + idRaw + "' not found." });
    }
    if (phoneRaw || emailRaw) {
      let guest = null;
      try {
        const gv = r.get("main_guest");
        const gid = Array.isArray(gv) ? gv[0] : gv || r.getString("main_guest");
        if (gid) guest = $app.findRecordById("guests", gid);
      } catch (_) {
        guest = null;
      }
      const okPhone =
        phoneRaw && guest && guest.getString("phone") === phoneRaw;
      const okEmail =
        emailRaw &&
        guest &&
        (guest.getString("email") || "").toLowerCase() === emailRaw.toLowerCase();
      if (!okPhone && !okEmail) {
        return e.json(403, {
          message: "Reservation does not belong to the given contact.",
        });
      }
    }
    return e.json(200, { count: 1, reservations: [serialize(r)] });
  }

  // All bookings for the contact.
  const guestIds = {};
  if (phoneRaw) {
    try {
      const list = $app.findRecordsByFilter(
        "guests",
        "phone = {:phone}",
        "",
        0,
        0,
        { phone: phoneRaw },
      );
      for (const g of list) guestIds[g.id] = true;
    } catch (_) {}
  }
  if (emailRaw) {
    try {
      const list = $app.findRecordsByFilter(
        "guests",
        "email = {:email}",
        "",
        0,
        0,
        { email: emailRaw },
      );
      for (const g of list) guestIds[g.id] = true;
    } catch (_) {}
  }
  const ids = Object.keys(guestIds);
  if (ids.length === 0) {
    return e.json(200, { count: 0, reservations: [] });
  }

  let records = [];
  try {
    for (const gid of ids) {
      const found = $app.findRecordsByFilter(
        "reservations",
        "main_guest = {:guestId}",
        "from_date",
        0,
        0,
        { guestId: gid },
      );
      for (const r of found) records.push(r);
    }
  } catch (_) {
    return e.json(500, { message: "Failed to lookup reservations." });
  }
  records.sort((a, b) => {
    const fa = a.getString("from_date") || "";
    const fb = b.getString("from_date") || "";
    return fa < fb ? -1 : fa > fb ? 1 : 0;
  });

  return e.json(200, {
    count: records.length,
    reservations: records.map(serialize),
  });
});
