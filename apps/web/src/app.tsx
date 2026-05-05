import { Navigate, Route, Routes } from "react-router";

import { AppLayoutRoute } from "./routes/app-layout.js";
import { AuthCallbackRoute } from "./routes/auth-callback.js";
import { RequireAuth } from "./routes/require-auth.js";
import { SignInRoute } from "./routes/signin.js";
import { TransactionsRoute } from "./routes/transactions.js";

export function App() {
  return (
    <Routes>
      <Route element={<SignInRoute />} path="/signin" />
      <Route element={<AuthCallbackRoute />} path="/auth/callback" />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayoutRoute />}>
          <Route element={<Navigate replace to="/transactions" />} index />
          <Route element={<TransactionsRoute />} path="/transactions" />
        </Route>
      </Route>
    </Routes>
  );
}
