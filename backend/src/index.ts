import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";

const app = new Elysia()
  .use(cors())
  .get("/", () => ({ message: "Hello from Bun + Elysia!" }))
  // Example of a typed POST request
  .post(
    "/user",
    ({ body }) => {
      return {
        id: 1,
        name: body.name,
        status: "created",
      };
    },
    {
      body: t.Object({
        name: t.String(),
      }),
    },
  )
  .listen(3001);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

// THE MOST IMPORTANT LINE:
export type App = typeof app;
