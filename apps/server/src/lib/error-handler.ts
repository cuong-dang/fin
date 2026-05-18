import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";

// Friendly messages for known unique-constraint names. The PG error
// itself just names the constraint; we translate to language the
// client can show. Anything not listed falls back to a generic
// "already exists" string.
const UNIQUE_VIOLATION_MESSAGES: Record<string, string> = {
  accounts_account_group_name_unique:
    "An account with this name already exists in this group.",
  account_groups_workspace_name_unique:
    "An account group with this name already exists.",
  categories_workspace_kind_name_unique:
    "A category with this name already exists.",
  subcategories_category_name_unique:
    "A subcategory with this name already exists in this category.",
  tags_workspace_name_unique: "A tag with this name already exists.",
};

// Friendly messages for known FK-violation constraint names. RESTRICT
// FKs surface 23503 when the parent is deleted while children still
// reference it.
const FK_VIOLATION_MESSAGES: Record<string, string> = {
  transactions_refunded_transaction_id_transactions_id_fk:
    "This transaction has refunds linked to it. Delete the refunds first.",
};

/**
 * Centralized Fastify error handler. Zod → 400, PG unique violations
 * (SQLSTATE 23505) → 409 with friendly messages, FK violations
 * (SQLSTATE 23503) → 409 with friendly messages, everything else → a
 * generic 500. The raw error is logged server-side; the response body
 * deliberately omits it so DrizzleQueryError messages (which include
 * the failing SQL and bound params) never leak to clients.
 *
 * Must be installed before `register(...)` calls — Fastify locks in
 * each plugin context's error handler when the plugin is registered,
 * so setting this later leaves the default handler in child contexts.
 */
export function installErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    if (err instanceof ZodError) {
      return reply
        .code(400)
        .send({ error: "Validation failed", issues: err.issues });
    }
    const cause = (
      err as { cause?: { code?: string; constraint_name?: string } }
    ).cause;
    if (cause?.code === "23505") {
      const message =
        (cause.constraint_name &&
          UNIQUE_VIOLATION_MESSAGES[cause.constraint_name]) ??
        "This value already exists.";
      return reply.code(409).send({ error: message });
    }
    if (cause?.code === "23503") {
      const message =
        (cause.constraint_name &&
          FK_VIOLATION_MESSAGES[cause.constraint_name]) ??
        "This row is referenced by other records.";
      return reply.code(409).send({ error: message });
    }
    app.log.error(err);
    return reply.code(err.statusCode ?? 500).send({ error: "Internal error" });
  });
}
