import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Add a `d1_databases` entry with binding `DB` to wrangler.jsonc (see `wrangler d1 create`)."
    );
  }

  return drizzle(env.DB, { schema });
}

export async function getUserById(id: number) {
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return user ?? null;
}
