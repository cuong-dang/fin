import cors from "@fastify/cors";
import Fastify from "fastify";

import { env } from "./env.js";
import { installErrorHandler } from "./lib/error-handler.js";
import { authPlugin } from "./plugins/auth.js";
import { accountGroupRoutes } from "./routes/account-groups.js";
import { accountRoutes } from "./routes/accounts.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { authRoutes } from "./routes/auth.js";
import { billRoutes } from "./routes/bills.js";
import { budgetRoutes } from "./routes/budgets.js";
import { categoryRoutes, subcategoryRoutes } from "./routes/categories.js";
import { tagRoutes } from "./routes/tags.js";
import { transactionRoutes } from "./routes/transactions.js";

const app = Fastify({ logger: true });

// CORS for cross-origin SPA → API requests (the SPA is served from a
// different host than the API in our two-service Render deployment).
// We use Bearer auth in `Authorization`, not cookies, so
// `credentials: false`. The `methods` list must be explicit:
// `@fastify/cors@11` shipped a default of just `GET,HEAD,POST`, so
// the SPA's PATCH / PUT / DELETE requests would otherwise be
// rejected at preflight.
await app.register(cors, {
  origin: env.WEB_ORIGIN,
  credentials: false,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
});

installErrorHandler(app);

await app.register(authPlugin);

app.get("/health", async () => ({ ok: true }));

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(accountGroupRoutes, { prefix: "/api/account-groups" });
await app.register(accountRoutes, { prefix: "/api/accounts" });
await app.register(categoryRoutes, { prefix: "/api/categories" });
await app.register(subcategoryRoutes, { prefix: "/api/subcategories" });
await app.register(tagRoutes, { prefix: "/api/tags" });
await app.register(transactionRoutes, { prefix: "/api/transactions" });
await app.register(billRoutes, { prefix: "/api/bills" });
await app.register(budgetRoutes, { prefix: "/api/budgets" });
await app.register(analyticsRoutes, { prefix: "/api/analytics" });

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
