import {
  bigint,
  char,
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

export const installmentFrequencyEnum = pgEnum("installment_frequency", [
  "monthly",
  "biweekly",
  "weekly",
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
    // Nullable: accounts can be ungrouped. Deleting an AccountGroup nulls the FK.
    accountGroupId: uuid("account_group_id").references(
      () => accountGroups.id,
      { onDelete: "set null" },
    ),
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

// ─── Installment plans ─────────────────────────────────────────────────────

export const installmentPlans = pgTable("installment_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Minor units in `currency`. e.g., $300,000 mortgage at USD → 30000000.
  totalAmount: bigint("total_amount", { mode: "bigint" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  // null = open-ended (e.g., line of credit)
  totalPeriods: integer("total_periods"),
  frequency: installmentFrequencyEnum("frequency").notNull(),
  firstPaymentDate: date("first_payment_date").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    type: transactionTypeEnum("type").notNull(),
    description: text("description"),
    installmentPlanId: uuid("installment_plan_id").references(
      () => installmentPlans.id,
      { onDelete: "set null" },
    ),
    // Stored as decimal for precision; high scale so minor-unit math is lossless.
    fxRate: numeric("fx_rate", { precision: 24, scale: 12 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("transactions_group_timestamp_idx").on(t.groupId, t.timestamp.desc()),
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
    tagId: uuid("tag_id").references(() => tags.id, { onDelete: "set null" }),
    // Positive minor units in `currency`. Sign is implied by transaction type.
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    description: text("description"),
  },
  (t) => [
    index("transaction_lines_tx_idx").on(t.transactionId),
    index("transaction_lines_category_idx").on(t.categoryId),
    index("transaction_lines_tag_idx").on(t.tagId),
  ],
);
