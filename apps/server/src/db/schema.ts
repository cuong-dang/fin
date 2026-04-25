import { sql } from "drizzle-orm";
import {
  bigint,
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
  unique,
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

// Disambiguates principal vs interest vs fee within a recurring-plan
// payment. Lives on `transaction_lines` so a single payment transaction
// can split across all three.
export const recurringPlanRoleEnum = pgEnum("recurring_plan_role", [
  "principal",
  "interest",
  "fee",
]);

export const categoryKindEnum = pgEnum("category_kind", ["income", "expense"]);

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
  },
  (t) => [unique("account_groups_group_name_unique").on(t.groupId, t.name)],
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("accounts_group_name_unique").on(t.groupId, t.name)],
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
  },
  (t) => [
    unique("categories_group_kind_name_unique").on(t.groupId, t.kind, t.name),
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
  },
  (t) => [
    unique("subcategories_category_name_unique").on(t.categoryId, t.name),
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
  },
  (t) => [unique("tags_group_name_unique").on(t.groupId, t.name)],
);

// ─── Recurring plans (installments) ────────────────────────────────────────

// Templated installment-style transactions with a cadence and (typically)
// a known end — mortgages, car loans, BNPL. Subscriptions live in their
// own table (`subscriptions`) since they have a different lifecycle and
// fields (cancellation, default-line categorization, no principal).
export const recurringPlans = pgTable("recurring_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Scheduled per-period charge in `currency`. e.g., $1,800 mortgage payment
  // → 180000; $15.99 Netflix → 1599. BNPL services may absorb cents on the
  // last payment — that variation is recorded by the actual transaction,
  // not here.
  amountPerPeriod: bigint("amount_per_period", { mode: "bigint" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  // null = open-ended (e.g., line of credit)
  totalPeriods: integer("total_periods"),
  // Original loan principal in `currency`. Set for installments where the
  // user wants interest analytics — total interest paid = sum of principal-
  // role line amounts minus this. Null for subscriptions (no principal).
  principalAmount: bigint("principal_amount", { mode: "bigint" }),
  frequency: recurringFrequencyEnum("frequency").notNull(),
  firstPaymentDate: date("first_payment_date").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Subscriptions ─────────────────────────────────────────────────────────

// Recurring expenses with a cadence and no principal/balance — Netflix,
// Spotify, AAA, software licenses. Each subscription has one or more
// default lines that act as a categorization template; transactions
// linked to the subscription pre-fill from those lines but the user
// can edit per-charge (a sub may temporarily charge a different amount).
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  frequency: recurringFrequencyEnum("frequency").notNull(),
  firstChargeDate: date("first_charge_date").notNull(),
  // Default source account auto-fills the source on a new charge transaction.
  // Nullable: user may not have settled on a default; the picker still
  // lets them choose per-charge.
  defaultAccountId: uuid("default_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  // null = active. Set when the user cancels; past transactions linked to
  // this subscription stay attached and the row is preserved for history.
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Default categorization template for a subscription. Mirrors the shape
// of `transaction_lines` so a charge transaction can copy lines verbatim.
// Sum of line amounts per subscription = the period charge.
export const subscriptionDefaultLines = pgTable(
  "subscription_default_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    subcategoryId: uuid("subcategory_id").references(() => subcategories.id, {
      onDelete: "restrict",
    }),
    // Positive minor units in `currency`.
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    description: text("description"),
  },
  (t) => [
    index("subscription_default_lines_sub_idx").on(t.subscriptionId),
    index("subscription_default_lines_category_idx").on(t.categoryId),
  ],
);

// Tag links for default lines — same shape as `transaction_line_tags`.
export const subscriptionDefaultLineTags = pgTable(
  "subscription_default_line_tags",
  {
    lineId: uuid("line_id")
      .notNull()
      .references(() => subscriptionDefaultLines.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.lineId, t.tagId] }),
    index("subscription_default_line_tags_tag_idx").on(t.tagId),
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
    recurringPlanId: uuid("recurring_plan_id").references(
      () => recurringPlans.id,
      { onDelete: "set null" },
    ),
    // Set when this transaction is a charge for a subscription. ON DELETE
    // SET NULL so cancelling/deleting the subscription preserves history.
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
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
    // For lines in a recurring-plan payment, disambiguates principal /
    // interest / fee. Null when the line isn't part of a loan or
    // subscription split. The plan link itself lives on the parent
    // transaction's `recurring_plan_id`.
    recurringPlanRole: recurringPlanRoleEnum("recurring_plan_role"),
    // Positive minor units in `currency`. Sign is implied by transaction type.
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    description: text("description"),
  },
  (t) => [
    index("transaction_lines_tx_idx").on(t.transactionId),
    index("transaction_lines_category_idx").on(t.categoryId),
  ],
);

// Many-to-many: each line can carry zero or more tags. Deleting a tag
// removes all its associations; deleting a line removes its tag rows.
export const transactionLineTags = pgTable(
  "transaction_line_tags",
  {
    lineId: uuid("line_id")
      .notNull()
      .references(() => transactionLines.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.lineId, t.tagId] }),
    index("transaction_line_tags_tag_idx").on(t.tagId),
  ],
);
