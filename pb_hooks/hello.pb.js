/// <reference path="../pb_data/types.d.ts" />

// Hello world sample — custom JS endpoints.
// PocketBase loads every *.pb.js file inside pb_hooks/ on boot.
// Docs: https://pocketbase.io/docs/js-routing
//
// Try:
//   GET http://localhost:8190/hello
//   GET http://localhost:8190/hello/niwde
//   GET http://localhost:8190/api/hello?name=niwde

routerAdd("GET", "/hello", (e) => {
    return e.json(200, { message: "Hello world!" })
})

routerAdd("GET", "/hello/{name}", (e) => {
    const name = e.request.pathValue("name")
    return e.json(200, { message: "Hello " + name + "!" })
})

// Namespaced under /api/ to avoid collisions with system routes.
// Use /api/<your-app>/... prefix for real features.
routerAdd("GET", "/api/hello", (e) => {
    const name = e.request.url.query().get("name") || "world"
    return e.json(200, { message: "Hello " + name + "!" })
})
