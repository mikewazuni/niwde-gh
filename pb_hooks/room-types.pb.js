/// <reference path="../pb_data/types.d.ts" />

// GET /api/room-types
// Public price list so the n8n agent can answer "berapa harga?"
// without dates. room_types is admin-only by collection rules.

routerAdd("GET", "/api/room-types", (e) => {
  let types = [];
  try {
    types = $app.findRecordsByFilter("room_types", "", "price", 0, 0);
  } catch (_) {
    return e.json(500, { message: "Failed to lookup room types." });
  }

  return e.json(200, {
    count: types.length,
    types: types.map((t) => ({
      id: t.id,
      name: t.getString("name"),
      price: t.get("price"),
      facility: t.getString("facility"),
    })),
  });
});
