/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const REGULAR = "tzuj5k212m6vs9k";
    const PLUS = "26qfsmrfyixy51t";

    const seeds = [
      { label: "101", relation: REGULAR, maintenance: false },
      { label: "102", relation: REGULAR, maintenance: false },
      { label: "103", relation: REGULAR, maintenance: false },
      { label: "201", relation: REGULAR, maintenance: false },
      { label: "202", relation: REGULAR, maintenance: false },
      { label: "203", relation: REGULAR, maintenance: true },
      { label: "301", relation: PLUS, maintenance: false },
      { label: "302", relation: PLUS, maintenance: false },
    ];

    const collection = app.findCollectionByNameOrId("rooms");

    for (const data of seeds) {
      let existing = null;
      try {
        existing = app.findFirstRecordByData("rooms", "label", data.label);
      } catch (_) {
        // not found, create below
      }
      if (existing) {
        continue; // already seeded, skip
      }

      const record = new Record(collection);
      record.set("label", data.label);
      record.set("relation", data.relation);
      record.set("maintenance", data.maintenance);

      app.save(record);
    }
  },
  (app) => {
    const labels = ["101", "102", "103", "201", "202", "203", "301", "302"];
    for (const label of labels) {
      try {
        const record = app.findFirstRecordByData("rooms", "label", label);
        if (record) {
          app.delete(record);
        }
      } catch (_) {
        // already deleted, skip
      }
    }
  },
);
