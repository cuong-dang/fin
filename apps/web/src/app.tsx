import { Route, Routes } from "react-router";
import { RequireAuth } from "./routes/require-auth.js";
import { SignInRoute } from "./routes/signin.js";
import { AppLayoutRoute } from "./routes/app-layout.js";

export function App() {
  return (
    <Routes>
      <Route element={<SignInRoute />} path="/signin" />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayoutRoute />}>
        </Route>
      </Route>
    </Routes>
  );
}
