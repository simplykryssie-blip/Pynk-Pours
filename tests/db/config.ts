export const PG_PORT = process.env.PP_PGPORT ?? "54329";
export const ADMIN_URL = `postgres://postgres@127.0.0.1:${PG_PORT}/postgres`;
export const TEMPLATE_DB = "pp_template";

export function assertLocal() {
  if (!ADMIN_URL.includes("@127.0.0.1:")) {
    throw new Error("DB tests must only run against the local disposable Postgres");
  }
}
