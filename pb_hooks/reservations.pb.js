/// <reference path="../pb_data/types.d.ts" />

// from_date => start of day, to_date => end of day. Admin UI + API.

onRecordCreateRequest((e) => {
  const from = e.record.getString("from_date");
  if (from && from.length >= 10) {
    e.record.set("from_date", from.substring(0, 10) + " 00:00:00.000Z");
  }
  const to = e.record.getString("to_date");
  if (to && to.length >= 10) {
    e.record.set("to_date", to.substring(0, 10) + " 23:59:59.999Z");
  }
  e.next();
}, "reservations");

onRecordUpdateRequest((e) => {
  const from = e.record.getString("from_date");
  if (from && from.length >= 10) {
    e.record.set("from_date", from.substring(0, 10) + " 00:00:00.000Z");
  }
  const to = e.record.getString("to_date");
  if (to && to.length >= 10) {
    e.record.set("to_date", to.substring(0, 10) + " 23:59:59.999Z");
  }
  e.next();
}, "reservations");
