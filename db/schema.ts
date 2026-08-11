import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  googleSub: text("google_sub").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  refreshToken: text("refresh_token").notNull(),
  accessToken: text("access_token"),
  accessTokenExpiresAt: integer("access_token_expires_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const driveSettings = sqliteTable("drive_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  folderId: text("folder_id").notNull(),
  folderName: text("folder_name"),
  lastSyncedAt: text("last_synced_at"),
});

export const patients = sqliteTable(
  "patients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    driveFileId: text("drive_file_id").notNull(),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("patients_drive_file_id_idx").on(table.driveFileId)],
);

export const patientDailyUpdates = sqliteTable("patient_daily_updates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientId: integer("patient_id").notNull().references(() => patients.id),
  syncDate: text("sync_date").notNull(),
  metricLabel: text("metric_label").notNull(),
  metricValue: integer("metric_value"),
  improvementPct: integer("improvement_pct"),
  status: text("status", { enum: ["hoje", "esta-semana", "acompanhar"] }).notNull(),
  summaryText: text("summary_text").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const nextSteps = sqliteTable("next_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientId: integer("patient_id").notNull().references(() => patients.id),
  description: text("description").notNull(),
  dueLabel: text("due_label"),
  dueDate: text("due_date"),
  category: text("category"),
  status: text("status", { enum: ["pending", "done", "superseded"] })
    .notNull()
    .default("pending"),
  sourceUpdateId: integer("source_update_id").references(() => patientDailyUpdates.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  finishedAt: text("finished_at"),
  status: text("status", { enum: ["running", "success", "error"] })
    .notNull()
    .default("running"),
  filesProcessed: integer("files_processed").notNull().default(0),
  error: text("error"),
});
