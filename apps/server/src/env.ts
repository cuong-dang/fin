function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const PORT = Number(process.env.PORT ?? 3001);

// On Render, RENDER_EXTERNAL_URL is auto-injected with the public
// origin of *this* service. SERVER_ORIGIN can default to it. WEB_ORIGIN
// points at the SPA (a different Render Static Site host), so it must
// be set explicitly in prod.
export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  AUTH_SECRET: required("AUTH_SECRET"),
  AUTH_GOOGLE_ID: required("AUTH_GOOGLE_ID"),
  AUTH_GOOGLE_SECRET: required("AUTH_GOOGLE_SECRET"),
  // Public origin of *this server*, used to build the OAuth callbackUri
  // that's registered in Google Console.
  SERVER_ORIGIN:
    process.env.SERVER_ORIGIN ??
    process.env.RENDER_EXTERNAL_URL ??
    `http://localhost:${PORT}`,
  // Public origin of the SPA — used as the CORS allow-origin and the
  // post-OAuth redirect target (the token is handed over via URL
  // fragment).
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  PORT,
};
