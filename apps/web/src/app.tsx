import { Navigate, Route, Routes } from "react-router";

import { AccountEditRoute } from "./routes/account-edit.js";
import { AccountGroupEditRoute } from "./routes/account-group-edit.js";
import { AccountNewRoute } from "./routes/account-new.js";
import { AppLayoutRoute } from "./routes/app-layout.js";
import { AuthCallbackRoute } from "./routes/auth-callback.js";
import { BillEditRoute } from "./routes/bill-edit.js";
import { BillNewRoute } from "./routes/bill-new.js";
import { ChartsRoute } from "./routes/charts.js";
import { NotFoundRoute } from "./routes/not-found.js";
import { RequireAuth } from "./routes/require-auth.js";
import { SettingsRoute } from "./routes/settings.js";
import { SettingsAccountsRoute } from "./routes/settings-accounts.js";
import { SettingsBillsRoute } from "./routes/settings-bills.js";
import { SettingsCategoriesRoute } from "./routes/settings-categories.js";
import { SignInRoute } from "./routes/signin.js";
import { TransactionEditRoute } from "./routes/transaction-edit.js";
import { TransactionNewRoute } from "./routes/transaction-new.js";
import { TransactionsRoute } from "./routes/transactions.js";

export function App() {
  return (
    <Routes>
      <Route element={<SignInRoute />} path="/signin" />
      <Route element={<AuthCallbackRoute />} path="/auth/callback" />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayoutRoute />}>
          <Route element={<Navigate replace to="/charts" />} index />
          <Route element={<TransactionsRoute />} path="/transactions" />
          <Route element={<ChartsRoute />} path="/charts" />
        </Route>
        <Route element={<AccountNewRoute />} path="/accounts/new" />
        <Route element={<TransactionNewRoute />} path="/transactions/new" />
        <Route element={<BillNewRoute />} path="/bills/new" />
        <Route element={<SettingsRoute />} path="/settings" />
        <Route element={<SettingsAccountsRoute />} path="/settings/accounts" />
        <Route
          element={<SettingsCategoriesRoute />}
          path="/settings/categories"
        />
        <Route element={<SettingsBillsRoute />} path="/settings/bills" />
        <Route element={<AccountEditRoute />} path="/accounts/:id/edit" />
        <Route
          element={<AccountGroupEditRoute />}
          path="/account-groups/:id/edit"
        />
        <Route
          element={<TransactionEditRoute />}
          path="/transactions/:id/edit"
        />
        <Route element={<BillEditRoute />} path="/bills/:id/edit" /> */
      </Route>
      <Route element={<NotFoundRoute />} path="*" />
    </Routes>
  );
}
