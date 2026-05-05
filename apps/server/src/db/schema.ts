import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Enums ─────────────────────────────────────────────────────────────────

export const transactionTypeEnum = pgEnum("transaction_type", [
  "income",
  "expense",
  "transfer",
  "adjustment",
]);

export const memberRoleEnum = pgEnum("member_role", ["owner", "member"]);

export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
]);

export const categoryKindEnum = pgEnum("category_kind", ["income", "expense"]);

// Three flavors of recurring bill, distinguished mostly by UX hints (the
// underlying mechanism is the same — a periodic charge with a default
// categorization template):
//   - utility:      variable-amount essential service (electric, water).
//   - subscription: fixed-amount discretionary service (Netflix).
//   - other:        catch-all for taxes, fees, dues, etc.
export const billTypeEnum = pgEnum("bill_type", [
  "utility",
  "subscription",
  "other",
]);

export const accountTypeEnum = pgEnum("account_type", [
  "checking_savings",
  "credit_card",
  "loan",
]);

// ─── Users & Workspaces ────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// A "workspace" is a shared scope for accounts, categories, transactions,
// etc. One user can belong to many workspaces via `workspaceMembers`.
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

// ─── Accounts, Categories, Tags ────────────────────────────────────────────

export const accountGroups = pgTable(
  "account_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("account_groups_workspace_name_unique")
      .on(t.workspaceId, t.name)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountGroupId: uuid("account_group_id")
      .notNull()
      .references(() => accountGroups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    type: accountTypeEnum("type").notNull(),
    // Credit limit in `currency` minor units. Set iff `type='credit_card'`.
    // Limit-remaining = creditLimit + Σ legs.amount on this account
    // (charges are negative legs, payments are positive transfer-in legs).
    creditLimit: bigint("credit_limit", { mode: "bigint" }),
    // Optional default source account for paying CC/loans.
    defaultPayFromAccountId: uuid("default_pay_from_account_id").references(
      (): AnyPgColumn => accounts.id,
      { onDelete: "restrict" },
    ),
    // Set iff `type='loan'`. Pairs the loan account 1:1 with the loan
    // terms (amount per period, frequency, default lines).
    loanId: uuid("loan_id").references((): AnyPgColumn => loans.id, {
      onDelete: "restrict",
    }),
    // Per-account opt-out from net-worth aggregations (sidebar header
    // total + /analytics/net-worth chart).
    excludeFromNetWorth: boolean("exclude_from_net_worth")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // null = active. Set to hide a still-relevant account (e.g., a paid-off
    // loan) from the sidebar without deleting it. Distinct from
    // `deletedAt`: archived accounts remain visible in the manage page so
    // the user can unarchive; deletion soft-hides them entirely.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("accounts_account_group_name_unique")
      .on(t.accountGroupId, t.name)
      .where(sql`${t.deletedAt} IS NULL`),
    uniqueIndex("accounts_loan_unique").on(t.loanId),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: categoryKindEnum("kind").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("categories_workspace_kind_name_unique")
      .on(t.workspaceId, t.kind, t.name)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export const subcategories = pgTable(
  "subcategories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("subcategories_category_name_unique")
      .on(t.categoryId, t.name)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("tags_workspace_name_unique")
      .on(t.workspaceId, t.name)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

// ─── Transactions, legs, lines ─────────────────────────────────────────────

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // Calendar date with no time or timezone — a transaction on date A stays
    // on date A regardless of the viewer's timezone. We accept that travelling
    // eastward/westward between entries can produce out-of-order dates
    // relative to createdAt; ties break on createdAt.
    //
    // NULL = pending (e.g., scheduled credit-card payment not yet cleared).
    // Pending transactions show at the top of the list independent of
    // completed-transaction pagination; "mark processed" sets the date.
    date: date("date", { mode: "string" }),
    type: transactionTypeEnum("type").notNull(),
    billId: uuid("bill_id").references(() => bills.id, {
      onDelete: "restrict",
    }),
    // Same-day ordering, user-controlled via drag-and-drop. For processed
    // transactions, values are {1..N} per (workspace_id, date). NULL when
    // pending (date IS NULL). Largest key = newest within the day.
    sortKey: integer("sort_key"),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Transactions are *not* soft-deleted.
  },
  (t) => [
    index("transactions_workspace_date_idx").on(t.workspaceId, t.date.desc()),
    uniqueIndex("transactions_workspace_date_sortkey_unique")
      .on(t.workspaceId, t.date, t.sortKey)
      .where(sql`${t.date} IS NOT NULL`),
    check(
      "transactions_sort_key_matches_date",
      sql`(${t.date} IS NULL) = (${t.sortKey} IS NULL)`,
    ),
  ],
);

export const transactionLegs = pgTable(
  "transaction_legs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    // Signed minor units. Negative = outflow, positive = inflow.
    // Currency derives from account.currency.
    amount: bigint("amount", { mode: "bigint" }).notNull(),
  },
  (t) => [
    index("transaction_legs_tx_idx").on(t.transactionId),
    index("transaction_legs_account_idx").on(t.accountId),
  ],
);

export const transactionLines = pgTable(
  "transaction_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    subcategoryId: uuid("subcategory_id").references(() => subcategories.id, {
      onDelete: "restrict",
    }),
    // Positive minor units in `currency`. Sign is implied by transaction type.
    // For loan payments (transfers with lines), each line categorizes a
    // portion of the payment as a non-principal cost (interest, fees).
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
  },
  (t) => [
    index("transaction_lines_tx_idx").on(t.transactionId),
    index("transaction_lines_category_idx").on(t.categoryId),
  ],
);

// Many-to-many: each line can carry zero or more tags.
export const transactionLineTags = pgTable(
  "transaction_line_tags",
  {
    lineId: uuid("line_id")
      .notNull()
      .references(() => transactionLines.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.lineId, t.tagId] }),
    index("transaction_line_tags_tag_idx").on(t.tagId),
  ],
);

// ─── Bills ─────────────────────────────────────────────────────────────────

// Recurring charges with a cadence and no principal/balance. The `type`
// enum distinguishes three UX flavors (see `billTypeEnum`); the
// underlying mechanism is identical — each bill owns default lines that
// act as a categorization template, and charge transactions link via
// `transactions.billId`. Charges pre-fill from the template but the
// user can edit per-charge (utilities especially vary period-to-period).
export const bills = pgTable("bills", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: billTypeEnum("type").notNull(),
  frequency: recurringFrequencyEnum("frequency").notNull(),
  defaultPayFromAccountId: uuid("default_pay_from_account_id").references(
    () => accounts.id,
    {
      onDelete: "restrict",
    },
  ),
  currency: char("currency", { length: 3 }).notNull(),
  // null = active. Set when the user cancels.
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Default categorization template for a bill. Mirrors the shape of
// `transaction_lines` so a charge transaction can copy lines verbatim.
// Sum of line amounts per bill = the period charge.
export const billDefaultLines = pgTable(
  "bill_default_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    subcategoryId: uuid("subcategory_id").references(() => subcategories.id, {
      onDelete: "restrict",
    }),
    amount: bigint("amount", { mode: "bigint" }),
  },
  (t) => [index("bill_default_lines_bill_idx").on(t.billId)],
);

export const billDefaultLineTags = pgTable(
  "bill_default_line_tags",
  {
    lineId: uuid("line_id")
      .notNull()
      .references(() => billDefaultLines.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.lineId, t.tagId] })],
);

// ─── Loans ─────────────────────────────────────────────────────────────────

// Loan terms — paired 1:1 with a `accounts` row of `type='loan'` via
// `accounts.loanId`. The account carries the running balance; this row
// captures the *terms*: amount-per-period, cadence, and the default
// categorization template for each payment (principal vs interest vs
// fees, applied via `loanDefaultLines`).
//
// Like bills, a loan owns a set of default lines. The actual amounts
// paid per period live on the linked transactions (e.g., sum of
// principal-role line amounts → principal reduction; sum of
// interest-role line amounts → total interest paid).
export const loans = pgTable("loans", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  amountPerPeriod: bigint("amount_per_period", { mode: "bigint" }).notNull(),
  frequency: recurringFrequencyEnum("frequency").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const loanDefaultLines = pgTable(
  "loan_default_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    loanId: uuid("loan_id")
      .notNull()
      .references(() => loans.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    subcategoryId: uuid("subcategory_id").references(() => subcategories.id, {
      onDelete: "restrict",
    }),
    amount: bigint("amount", { mode: "bigint" }),
  },
  (t) => [index("loan_default_lines_loan_idx").on(t.loanId)],
);

export const loanDefaultLineTags = pgTable(
  "loan_default_line_tags",
  {
    lineId: uuid("line_id")
      .notNull()
      .references(() => loanDefaultLines.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.lineId, t.tagId] })],
);
