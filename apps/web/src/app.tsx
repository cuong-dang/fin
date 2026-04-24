import { Route, Routes } from "react-router";
import { AccountEditRoute } from "./routes/account-edit";
import { AccountGroupEditRoute } from "./routes/account-group-edit";
import { AccountNewRoute } from "./routes/account-new";
import { AccountsManageRoute } from "./routes/accounts-manage";
import { AuthCallbackRoute } from "./routes/auth-callback";
import { HomeRoute } from "./routes/home";
import { NotFoundRoute } from "./routes/not-found";
import { RequireAuth } from "./routes/require-auth";
import { SettingsCategoriesRoute } from "./routes/settings-categories";
import { SettingsRoute } from "./routes/settings";
import { SignInRoute } from "./routes/signin";
import { TransactionEditRoute } from "./routes/transaction-edit";
import { TransactionNewRoute } from "./routes/transaction-new";

export function App() {
  return (
    <Routes>
      <Route element={<SignInRoute />} path="/signin" />
      <Route element={<AuthCallbackRoute />} path="/auth/callback" />
      <Route element={<RequireAuth />}>
        <Route element={<HomeRoute />} path="/" />
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
      </Route>
      <Route element={<NotFoundRoute />} path="*" />
    </Routes>
  );
}
