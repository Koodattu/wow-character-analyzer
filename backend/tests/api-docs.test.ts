import { expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { apiDocs } from "../src/lib/api-docs";

test("the existing Swagger URLs serve the UI and a schema for registered routes", async () => {
  const app = new Elysia().use(apiDocs).get("/characters/:name", ({ params }) => params.name, {
    params: t.Object({ name: t.String() }),
  });
  const ui = await app.handle(new Request("http://localhost/swagger"));
  expect(ui.status).toBe(200);
  expect(ui.headers.get("content-type")).toContain("text/html");
  expect(await ui.text()).toContain("/swagger/json");

  const response = await app.handle(new Request("http://localhost/swagger/json"));
  expect(response.status).toBe(200);
  const schema = await response.json();
  expect(schema.info.title).toBe("WoW Character Analyzer API");
  expect(schema.paths["/characters/{name}"].get.parameters).toContainEqual(
    expect.objectContaining({ name: "name", in: "path", required: true }),
  );
});
