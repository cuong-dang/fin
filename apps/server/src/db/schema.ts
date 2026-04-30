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
  numeric,
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

// Ordering preserves the existing Postgres enum order (monthly/biweekly/weekly
// were the original values); quarterly + yearly were appended via ALTER TYPE.
// UIs should sort by their own logic (e.g., shortest cadence first), not by
// enum order.
export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "monthly",
  "biweekly",
  "weekly",
  "quarterly",
  "yearly",
]);

export const categoryKindEnum = pgEnum("category_kind", ["income", "expense"]);

// Three flavors of recurring bill, distinguished mostly by UX hints (the
// underlying mechanism is the same — a periodic charge with a default
// categorization template):
//   - utility:      variable-amount essential service (electric, water).
//   - subscription: fixed-amount discretionary service (Netflix). Pause/cancel.
//   - other:        catch-all for taxes, fees, dues, etc.
// Old data migrated 1:1 as `subscription` (the original semantic).
export const billTypeEnum = pgEnum("bill_type", [
  "utility",
  "subscription",
  "other",
]);

// `loan` is reserved — only `checking_savings` and `credit_card` are wired
// today. Loan accounts will pair 1:1 with a recurring_plan when added.
export const accountTypeEnum = pgEnum("account_type", [
  "checking_savings",
  "credit_card",
  "loan",
]);

// ─── Users & Groups ────────────────────────────────────────────────────────

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

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

// ─── Reference data (per-group) ────────────────────────────────────────────

export const accountGroups = pgTable(
  "account_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Soft-delete: null = active. Set when the user "deletes" the row;
    // historical references stay valid and pickers filter on this.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // Active-only unique: a soft-deleted row may share its name with the
    // current active row (or a future re-creation) without conflict.
    uniqueIndex("account_groups_group_name_unique")
      .on(t.groupId, t.name)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    // An account must belong to an AccountGroup. Deleting a group with
    // accounts is blocked — user must move or delete the accounts first.
    accountGroupId: uuid("account_group_id")
      .notNull()
      .references(() => accountGroups.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    type: accountTypeEnum("type").notNull().default("checking_savings"),
    // Credit limit in `currency` minor units. Set iff `type='credit_card'`.
    // Limit-remaining = creditLimit + Σ legs.amount on this account
    // (charges are negative legs, payments are positive transfer-in legs).
    creditLimit: bigint("credit_limit", { mode: "bigint" }),
    // Optional default source account for paying this CC. Must point to a
    // checking_savings account in the same group; enforced at the route.
    // RESTRICT to match the convention for FKs to soft-deletable parents.
    defaultPayFromAccountId: uuid("default_pay_from_account_id").references(
      (): AnyPgColumn => accounts.id,
      { onDelete: "restrict" },
    ),
    // Set iff `type='loan'`. Pairs the loan account 1:1 with the
    // recurring_plans row that holds the schedule (amount_per_period,
    // total_periods, principal, frequency, default pay-from). RESTRICT —
    // both rows are soft-deletable; the FK guards against accidental
    // hard-deletes.
    recurringPlanId: uuid("recurring_plan_id").references(
      (): AnyPgColumn => recurringPlans.id,
      { onDelete: "restrict" },
    ),
    // Per-account opt-out from net-worth aggregations (sidebar header
    // total + /analytics/net-worth chart). The account row, its balance,
    // and its group subtotal stay visible in the sidebar — the flag only
    // controls whether the account contributes to "your net worth".
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
    // Soft-delete: see account_groups.deleted_at.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("accounts_group_name_unique")
      .on(t.groupId, t.name)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    kind: categoryKindEnum("kind").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Soft-delete: see account_groups.deleted_at.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("categories_group_kind_name_unique")
      .on(t.groupId, t.kind, t.name)
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
    // Soft-delete: see account_groups.deleted_at.
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
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Soft-delete: see account_groups.deleted_at.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("tags_group_name_unique")
      .on(t.groupId, t.name)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

// ─── Recurring plans (installments) ────────────────────────────────────────

// Templated installment-style transactions with a cadence and (typically)
// a known end — mortgages, car loans, BNPL.
//
// Like bills, a recurring plan owns a set of default lines that act
// as a categorization template. The actual amounts paid per period live on
// the linked transactions (sum of principal-role line amounts → principal
// reduction; sum of interest-role line amounts → total interest paid).
// The fields here capture the loan *terms*, not running totals.
export const recurringPlans = pgTable("recurring_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  // No `name`: a recurring plan is paired 1:1 with a loan account, so
  // displays use the account's name. Adds a single source of truth.
  amountPerPeriod: bigint("amount_per_period", { mode: "bigint" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  // No `total_periods`: derivable as ceil(|currentBalance| / amountPerPeriod).
  frequency: recurringFrequencyEnum("frequency").notNull(),
  // Default source account auto-fills the source on a new charge transaction.
  defaultAccountId: uuid("default_account_id").references(() => accounts.id, {
    onDelete: "restrict",
  }),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Soft-delete: see account_groups.deleted_at.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Default categorization template for a recurring plan. Mirrors
// `bill_default_lines`. Amount is *nullable* on purpose: for
// amortizing loans the principal/interest split changes per period, so
// the template records categorization but leaves amounts to be entered
// at transaction time. Set the amount only when it's actually fixed
// (e.g., flat BNPL).
export const recurringPlanDefaultLines = pgTable(
  "recurring_plan_default_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recurringPlanId: uuid("recurring_plan_id")
      .notNull()
      .references(() => recurringPlans.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    subcategoryId: uuid("subcategory_id").references(() => subcategories.id, {
      onDelete: "restrict",
    }),
    // Positive minor units in `currency`. Null = "varies per period" — the
    // user fills it in on the actual payment transaction.
    amount: bigint("amount", { mode: "bigint" }),
    currency: char("currency", { length: 3 }).notNull(),
    description: text("description"),
  },
  (t) => [
    index("recurring_plan_default_lines_plan_idx").on(t.recurringPlanId),
    index("recurring_plan_default_lines_category_idx").on(t.categoryId),
  ],
);

// Tag links for recurring-plan default lines — same shape as
// `transaction_line_tags` and `bill_default_line_tags`.
export const recurringPlanDefaultLineTags = pgTable(
  "recurring_plan_default_line_tags",
  {
    lineId: uuid("line_id")
      .notNull()
      .references(() => recurringPlanDefaultLines.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.lineId, t.tagId] }),
    index("recurring_plan_default_line_tags_tag_idx").on(t.tagId),
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
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: billTypeEnum("type").notNull().default("subscription"),
  currency: char("currency", { length: 3 }).notNull(),
  frequency: recurringFrequencyEnum("frequency").notNull(),
  // Default source account auto-fills the source on a new charge transaction.
  // Nullable: user may not have settled on a default; the picker still
  // lets them choose per-charge. RESTRICT — see recurring_plans.
  defaultAccountId: uuid("default_account_id").references(() => accounts.id, {
    onDelete: "restrict",
  }),
  // null = active. Set when the user cancels; past transactions linked to
  // this bill stay attached and the row is preserved for history.
  // Distinct from `deletedAt`: cancellation stops projections but the bill
  // remains visible in the management UI; deletion soft-hides it entirely.
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Soft-delete: see account_groups.deleted_at.
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
    // Positive minor units in `currency`. Nullable: a bill may charge a
    // varying amount per period (utilities, taxes), in which case the
    // template carries categorization but leaves the amount blank — the
    // user fills it in on the actual charge transaction.
    amount: bigint("amount", { mode: "bigint" }),
    currency: char("currency", { length: 3 }).notNull(),
    description: text("description"),
  },
  (t) => [
    index("bill_default_lines_bill_idx").on(t.billId),
    index("bill_default_lines_category_idx").on(t.categoryId),
  ],
);

// Tag links for default lines — same shape as `transaction_line_tags`.
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
  (t) => [
    primaryKey({ columns: [t.lineId, t.tagId] }),
    index("bill_default_line_tags_tag_idx").on(t.tagId),
  ],
);

// ─── Transactions, legs, lines ─────────────────────────────────────────────

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
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
    description: text("description"),
    // No `recurring_plan_id` here on purpose: a loan payment is a transfer
    // with a leg on the loan account, and the loan account already carries
    // `recurring_plan_id`. The plan is reachable via tx → leg → account →
    // plan, so a direct FK on transactions would just duplicate the link.
    // Bills, by contrast, are stored as expenses with no leg on a
    // bill-side account, so the explicit `bill_id` below is the only
    // way to identify a bill charge.
    //
    // Set when this transaction is a charge for a bill. RESTRICT —
    // we soft-delete bills; past transactions retain their link.
    billId: uuid("bill_id").references(() => bills.id, {
      onDelete: "restrict",
    }),
    // Stored as decimal for precision; high scale so minor-unit math is lossless.
    fxRate: numeric("fx_rate", { precision: 24, scale: 12 }),
    // Same-day ordering, user-controlled via drag-and-drop. For processed
    // transactions, values are {1..N} per (group_id, date). NULL when
    // pending (date IS NULL). Largest key = newest within the day.
    sortKey: integer("sort_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Transactions are *not* soft-deleted: nothing else references a tx
    // (legs/lines/tag junctions all cascade off it), so hard-delete keeps
    // balances and principal totals correct without filter clauses.
  },
  (t) => [
    index("transactions_group_date_idx").on(t.groupId, t.date.desc()),
    uniqueIndex("transactions_group_date_sortkey_unique")
      .on(t.groupId, t.date, t.sortKey)
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
    // Currency derives from account.currency (accounts are single-currency, immutable).
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
    description: text("description"),
  },
  (t) => [
    index("transaction_lines_tx_idx").on(t.transactionId),
    index("transaction_lines_category_idx").on(t.categoryId),
  ],
);

// Many-to-many: each line can carry zero or more tags. Deleting a line
// removes its tag rows (compositional). Tags themselves are soft-deleted,
// so the tag-side FK uses RESTRICT — the tag row always exists.
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
