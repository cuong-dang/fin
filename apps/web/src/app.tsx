import { Navigate, Route, Routes } from "react-router";

import { AppLayoutRoute } from "./components/app-layout";
import { AccountEditRoute } from "./routes/account-edit";
import { AccountGroupEditRoute } from "./routes/account-group-edit";
import { AccountNewRoute } from "./routes/account-new";
import { AccountsManageRoute } from "./routes/accounts-manage";
import { AuthCallbackRoute } from "./routes/auth-callback";
import { BillEditRoute } from "./routes/bill-edit";
import { BillNewRoute } from "./routes/bill-new";
import { ChartsRoute } from "./routes/charts";
import { NotFoundRoute } from "./routes/not-found";
import { RequireAuth } from "./routes/require-auth";
import { SettingsRoute } from "./routes/settings";
import { SettingsBillsRoute } from "./routes/settings-bills";
import { SettingsCategoriesRoute } from "./routes/settings-categories";
import { SignInRoute } from "./routes/signin";
import { TransactionEditRoute } from "./routes/transaction-edit";
import { TransactionNewRoute } from "./routes/transaction-new";
import { TransactionsRoute } from "./routes/transactions";

export function App() {
  return (
    <Routes>
      <Route element={<SignInRoute />} path="/signin" />
      <Route element={<AuthCallbackRoute />} path="/auth/callback" />
      <Route element={<RequireAuth />}>
        {/* In-chrome pages share AppLayout (header + nav + FAB). */}
        <Route element={<AppLayoutRoute />}>
          <Route element={<Navigate replace to="/charts" />} path="/" />
          <Route element={<TransactionsRoute />} path="/transactions" />
          <Route element={<ChartsRoute />} path="/charts" />
        </Route>
        {/* Form / detail routes render outside the chrome for focus. */}
        <Route element={<AccountsManageRoute />} path="/accounts" />
        <Route element={<AccountNewRoute />} path="/accounts/new" />
        <Route element={<AccountEditRoute />} path="/accounts/:id/edit" />
        <Route
          element={<AccountGroupEditRoute />}
          path="/account-groups/:id/edit"
        />
        <Route element={<TransactionNewRoute />} path="/transactions/new" />
        <Route
          element={<TransactionEditRoute />}
          path="/transactions/:id/edit"
        />
        <Route element={<SettingsRoute />} path="/settings" />
        <Route
          element={<SettingsCategoriesRoute />}
          path="/settings/categories"
        />
        <Route element={<SettingsBillsRoute />} path="/settings/bills" />
        <Route element={<BillNewRoute />} path="/bills/new" />
        <Route element={<BillEditRoute />} path="/bills/:id/edit" />
      </Route>
      <Route element={<NotFoundRoute />} path="*" />
    </Routes>
  );
}
