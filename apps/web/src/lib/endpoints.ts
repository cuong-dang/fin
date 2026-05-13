import type {
  Account,
  AccountGroup,
  AdjustmentUpdateBody,
  AnalyticsChartResponse,
  Bill,
  CashFlowQuery,
  CategoryWithSubs,
  CreateAccountBody,
  CreateBillBody,
  CreateCategoryBody,
  CreateSubcategoryBody,
  CreateTagBody,
  EnrichedTransaction,
  Me,
  ProcessTransactionBody,
  ReorderTransactionsBody,
  Tag,
  TransactionBody,
  TransactionsListResponse,
  UpdateAccountBody,
  UpdateAccountGroupBody,
  UpdateBillBody,
  UpdateCategoryBody,
  UpdateSubcategoryBody,
  UpdateTagBody,
} from "@fin/schemas";

import { api } from "./api.js";

// ─── Auth ─────────────────────────────────────────────────────────────────

export const me = () => api<Me>("/api/auth/me");

// ─── Account groups ───────────────────────────────────────────────────────

export const listAccountGroups = () =>
  api<AccountGroup[]>("/api/account-groups");

export const updateAccountGroup = (id: string, body: UpdateAccountGroupBody) =>
  api<AccountGroup>(`/api/account-groups/${id}`, {
    method: "PATCH",
    json: body,
  });

export const deleteAccountGroup = (id: string) =>
  api<void>(`/api/account-groups/${id}`, { method: "DELETE" });

// ─── Accounts ─────────────────────────────────────────────────────────────

export const listAccounts = () => api<Account[]>("/api/accounts");

export const getAccount = (id: string) => api<Account>(`/api/accounts/${id}`);

export const createAccount = (body: CreateAccountBody) =>
  api<Account>("/api/accounts", { method: "POST", json: body });

export const updateAccount = (id: string, body: UpdateAccountBody) =>
  api<void>(`/api/accounts/${id}`, { method: "PATCH", json: body });

export const deleteAccount = (id: string) =>
  api<void>(`/api/accounts/${id}`, { method: "DELETE" });

export const archiveAccount = (id: string) =>
  api<void>(`/api/accounts/${id}/archive`, { method: "POST" });

export const unarchiveAccount = (id: string) =>
  api<void>(`/api/accounts/${id}/unarchive`, { method: "POST" });

// ─── Transactions ─────────────────────────────────────────────────────────

export const listTransactions = (accountId?: string) => {
  const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
  return api<TransactionsListResponse>(`/api/transactions${qs}`);
};

export const getTransaction = (id: string) =>
  api<EnrichedTransaction>(`/api/transactions/${id}`);

export const createTransaction = (body: TransactionBody) =>
  api<{ id: string }>("/api/transactions", { method: "POST", json: body });

export const updateTransaction = (id: string, body: TransactionBody) =>
  api<void>(`/api/transactions/${id}`, { method: "PATCH", json: body });

export const updateAdjustmentTransaction = (
  id: string,
  body: AdjustmentUpdateBody,
) =>
  api<void>(`/api/transactions/${id}/adjustment`, {
    method: "PATCH",
    json: body,
  });

export const processTransaction = (id: string, body: ProcessTransactionBody) =>
  api<void>(`/api/transactions/${id}/process`, { method: "POST", json: body });

export const reorderTransactions = (body: ReorderTransactionsBody) =>
  api<void>("/api/transactions/reorder", { method: "POST", json: body });

export const deleteTransaction = (id: string) =>
  api<void>(`/api/transactions/${id}`, { method: "DELETE" });

// ─── Categories / subcategories / tags ────────────────────────────────────

export const listCategories = () => api<CategoryWithSubs[]>("/api/categories");

export const createCategory = (body: CreateCategoryBody) =>
  api<CategoryWithSubs>("/api/categories", { method: "POST", json: body });

export const updateCategory = (id: string, body: UpdateCategoryBody) =>
  api<void>(`/api/categories/${id}`, { method: "PATCH", json: body });

export const deleteCategory = (id: string) =>
  api<void>(`/api/categories/${id}`, { method: "DELETE" });

export const createSubcategory = (
  categoryId: string,
  body: CreateSubcategoryBody,
) =>
  api<{ id: string; name: string }>(
    `/api/categories/${categoryId}/subcategories`,
    { method: "POST", json: body },
  );

export const updateSubcategory = (id: string, body: UpdateSubcategoryBody) =>
  api<void>(`/api/subcategories/${id}`, { method: "PATCH", json: body });

export const deleteSubcategory = (id: string) =>
  api<void>(`/api/subcategories/${id}`, { method: "DELETE" });

export const listTags = (kind?: "expense" | "income") => {
  const qs = kind ? `?kind=${kind}` : "";
  return api<Tag[]>(`/api/tags${qs}`);
};

export const createTag = (body: CreateTagBody) =>
  api<Tag>("/api/tags", { method: "POST", json: body });

export const updateTag = (id: string, body: UpdateTagBody) =>
  api<void>(`/api/tags/${id}`, { method: "PATCH", json: body });

export const deleteTag = (id: string) =>
  api<void>(`/api/tags/${id}`, { method: "DELETE" });

// ─── Bills ────────────────────────────────────────────────────────────────

export const listBills = () => api<Bill[]>("/api/bills");

export const getBill = (id: string) => api<Bill>(`/api/bills/${id}`);

export const createBill = (body: CreateBillBody) =>
  api<{ id: string }>("/api/bills", { method: "POST", json: body });

export const updateBill = (id: string, body: UpdateBillBody) =>
  api<void>(`/api/bills/${id}`, { method: "PATCH", json: body });

export const cancelBill = (id: string) =>
  api<void>(`/api/bills/${id}/cancel`, { method: "POST" });

export const resumeBill = (id: string) =>
  api<void>(`/api/bills/${id}/resume`, { method: "POST" });

export const deleteBill = (id: string) =>
  api<void>(`/api/bills/${id}`, { method: "DELETE" });

// ─── Analytics ────────────────────────────────────────────────────────────

export const getCashFlow = (q: CashFlowQuery) => {
  const qs = new URLSearchParams({
    granularity: q.granularity,
    start: q.start,
    end: q.end,
    currency: q.currency,
    dimension: q.dimension,
  });
  if (q.categoryId) qs.set("categoryId", q.categoryId);
  if (q.subcategoryId) qs.set("subcategoryId", q.subcategoryId);
  if (q.accountGroupId) qs.set("accountGroupId", q.accountGroupId);
  if (q.billType) qs.set("billType", q.billType);
  if (q.billId) qs.set("billId", q.billId);
  if (q.loanId) qs.set("loanId", q.loanId);
  return api<AnalyticsChartResponse>(`/api/analytics/cash-flow?${qs}`);
};
