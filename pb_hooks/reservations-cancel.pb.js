/// <reference path="../pb_data/types.d.ts" />

// POST /api/reservations/cancel
// Body (JSON): { reservation_id: "abc", phone?: "08...", email?: "a@b.c" }
// Deletes the booking after verifying it belongs to the given contact.

routerAdd("POST", "/api/reservations/cancel", (e) => {
  const body = new DynamicModel({
    reservation_id: "",
    phone: "",
    email: "",
  });
  try {
    e.bindBody(body);
  } catch (_) {
    return e.json(400, { message: "Invalid JSON body." });
  }

  const idRaw = (body.reservation_id || "").trim();
  const phoneRaw = (body.phone || "").trim();
  const emailRaw = (body.email || "").trim();

  const errors = {};
  if (!idRaw) errors.reservation_id = "reservation_id is required.";
  if (!phoneRaw && !emailRaw)
    errors.phone = "phone or email is required to verify ownership.";
  if (Object.keys(errors).length > 0) {
    return e.json(400, { message: "Validation failed.", data: errors });
  }

  let r = null;
  try {
    r = $app.findRecordById("reservations", idRaw);
  } catch (_) {
    return e.json(404, { message: "Reservation '" + idRaw + "' not found." });
  }

  let guest = null;
  try {
    const gv = r.get("main_guest");
    const gid = Array.isArray(gv) ? gv[0] : gv || r.getString("main_guest");
    if (gid) guest = $app.findRecordById("guests", gid);
  } catch (_) {
    guest = null;
  }
  if (!guest) {
    return e.json(404, { message: "Guest for this reservation not found." });
  }
  if (phoneRaw && guest.getString("phone") !== phoneRaw) {
    return e.json(403, {
      message: "Reservation does not belong to the given contact.",
    });
  }
  if (
    emailRaw &&
    (guest.getString("email") || "").toLowerCase() !== emailRaw.toLowerCase()
  ) {
    return e.json(403, {
      message: "Reservation does not belong to the given contact.",
    });
  }

  const fromDate = r.getString("from_date").substring(0, 10);
  const toDate = r.getString("to_date").substring(0, 10);
  let roomLabel = "";
  try {
    const rv = r.get("room");
    const rid = Array.isArray(rv) ? rv[0] : rv || r.getString("room");
    if (rid) roomLabel = $app.findRecordById("rooms", rid).getString("label");
  } catch (_) {}

  try {
    $app.delete(r);
  } catch (_) {
    return e.json(500, { message: "Failed to cancel reservation." });
  }

  return e.json(200, {
    id: idRaw,
    cancelled: true,
    from_date: fromDate,
    to_date: toDate,
    room_label: roomLabel,
  });
});
