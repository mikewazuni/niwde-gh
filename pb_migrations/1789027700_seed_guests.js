/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const now = new DateTime();

    const seeds = [
      { name: "Guest One", phone: "081200000001", email: "guest1@example.com" },
      { name: "Guest Two", phone: "081200000002", email: "guest2@example.com" },
      { name: "Guest Three", phone: "081200000003", email: "guest3@example.com" },
    ];

    const collection = app.findCollectionByNameOrId("guests");

    for (const data of seeds) {
      let existing = null;
      try {
        existing = app.findFirstRecordByData("guests", "phone", data.phone);
      } catch (_) {
        // not found, create below
      }
      if (existing) {
        continue; // already seeded, skip
      }

      const record = new Record(collection);
      record.set("name", data.name);
      record.set("phone", data.phone);
      record.set("email", data.email);
      // current date as seed timestamp (autodate would also default to now)
      record.set("created", now);
      record.set("updated", now);

      app.save(record);
    }
  },
  (app) => {
    const phones = ["081200000001", "081200000002", "081200000003"];
    for (const phone of phones) {
      try {
        const record = app.findFirstRecordByData("guests", "phone", phone);
        if (record) {
          app.delete(record);
        }
      } catch (_) {
        // already deleted, skip
      }
    }
  },
);
