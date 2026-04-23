import type {
  Account,
  AccountGroup,
  AdjustmentUpdateBody,
  CategoryWithSubs,
  CreateAccountBody,
  CreateCategoryBody,
  CreateSubcategoryBody,
  Me,
  ProcessTransactionBody,
  ReorderTransactionsBody,
  Tag,
  TransactionBody,
  TransactionsListResponse,
  UpdateAccountBody,
  UpdateAccountGroupBody,
  UpdateCategoryBody,
  UpdateSubcategoryBody,
} from "@fin/schemas";
import { api } from "./api";

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

// ─── Transactions ─────────────────────────────────────────────────────────

export const listTransactions = (accountId?: string) => {
  const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
  return api<TransactionsListResponse>(`/api/transactions${qs}`);
};

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

export const listTags = () => api<Tag[]>("/api/tags");
