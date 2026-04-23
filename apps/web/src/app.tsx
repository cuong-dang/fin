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
      <Route path="/signin" element={<SignInRoute />} />
      <Route path="/auth/callback" element={<AuthCallbackRoute />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/accounts" element={<AccountsManageRoute />} />
        <Route path="/accounts/new" element={<AccountNewRoute />} />
        <Route path="/accounts/:id/edit" element={<AccountEditRoute />} />
        <Route
          path="/account-groups/:id/edit"
          element={<AccountGroupEditRoute />}
        />
        <Route path="/transactions/new" element={<TransactionNewRoute />} />
        <Route
          path="/transactions/:id/edit"
          element={<TransactionEditRoute />}
        />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route
          path="/settings/categories"
          element={<SettingsCategoriesRoute />}
        />
      </Route>
      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
}
