/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("room_types");

  const seeds = [
    {
      id: "tzuj5k212m6vs9k",
      name: "Reguler",
      facility: "<p>Basic (AC, Toilet, Water Heater)</p>",
    },
    {
      id: "26qfsmrfyixy51t",
      name: "Plus",
      facility: "<p>Basic (AC, Toilet, Water Heater)<br>+ Kitchen</p>",
    },
  ];

  for (const data of seeds) {
    try {
      app.findRecordById(collection, data.id);
      continue; // already seeded, skip
    } catch (_) {
      // not found, create below
    }

    const record = new Record(collection);
    record.set("id", data.id);
    record.set("name", data.name);
    record.set("facility", data.facility);

    app.save(record);
  }
}, (app) => {
  const ids = ["tzuj5k212m6vs9k", "26qfsmrfyixy51t"];
  for (const id of ids) {
    try {
      const record = app.findRecordById("room_types", id);
      app.delete(record);
    } catch (_) {
      // already deleted, skip
    }
  }
});
