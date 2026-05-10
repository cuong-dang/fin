import Fastify, { type FastifyError } from "fastify";
import { ZodError } from "zod";

import { env } from "./env.js";
import { authPlugin } from "./plugins/auth.js";
import { accountGroupRoutes } from "./routes/account-groups.js";
import { accountRoutes } from "./routes/accounts.js";
import { authRoutes } from "./routes/auth.js";
// import { accountGroupRoutes } from "./routes/account-groups";
// import { accountRoutes } from "./routes/accounts";
// import { analyticsRoutes } from "./routes/analytics";
import { categoryRoutes, subcategoryRoutes } from "./routes/categories.js";
import { tagRoutes } from "./routes/tags.js";
// import { billRoutes } from "./routes/bills";
// import { categoryRoutes, subcategoryRoutes } from "./routes/categories";
import { transactionRoutes } from "./routes/transactions.js";

const app = Fastify({ logger: true });

await app.register(authPlugin);

app.get("/health", async () => ({ ok: true }));

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(accountGroupRoutes, { prefix: "/api/account-groups" });
await app.register(accountRoutes, { prefix: "/api/accounts" });
await app.register(categoryRoutes, { prefix: "/api/categories" });
await app.register(subcategoryRoutes, { prefix: "/api/subcategories" });
await app.register(tagRoutes, { prefix: "/api/tags" });
await app.register(transactionRoutes, { prefix: "/api/transactions" });
// await app.register(billRoutes, { prefix: "/api/bills" });
// await app.register(analyticsRoutes, { prefix: "/api/analytics" });

// Centralized error handler — Zod validation errors become 400s.
app.setErrorHandler((err: FastifyError, _req, reply) => {
  if (err instanceof ZodError) {
    return reply
      .code(400)
      .send({ error: "Validation failed", issues: err.issues });
  }
  app.log.error(err);
  return reply
    .code(err.statusCode ?? 500)
    .send({ error: err.message ?? "Internal error" });
});

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
