function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  AUTH_SECRET: required("AUTH_SECRET"),
  AUTH_GOOGLE_ID: required("AUTH_GOOGLE_ID"),
  AUTH_GOOGLE_SECRET: required("AUTH_GOOGLE_SECRET"),
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  PORT: Number(process.env.PORT ?? 3001),
};
