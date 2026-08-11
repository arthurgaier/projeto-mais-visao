import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { driveSettings, nextSteps, patientDailyUpdates, patients } from "../db/schema";
import { requireUser } from "../lib/session";
import { DashboardClient, type PatientRecord } from "./dashboard-client";

export const dynamic = "force-dynamic";

const STATUS_LABEL = {
  hoje: "Hoje",
  "esta-semana": "Esta semana",
  acompanhar: "Acompanhar",
} as const;

export default async function Home() {
  const user = await requireUser();
  const db = getDb();

  const patientRows = await db.select().from(patients).where(eq(patients.userId, user.id));
  const patientIds = patientRows.map((patient) => patient.id);

  const records: PatientRecord[] = [];

  if (patientIds.length > 0) {
    const updateRows = await db
      .select()
      .from(patientDailyUpdates)
      .where(inArray(patientDailyUpdates.patientId, patientIds))
      .orderBy(desc(patientDailyUpdates.syncDate), desc(patientDailyUpdates.id));

    const latestUpdateByPatient = new Map<number, (typeof updateRows)[number]>();
    for (const row of updateRows) {
      if (!latestUpdateByPatient.has(row.patientId)) {
        latestUpdateByPatient.set(row.patientId, row);
      }
    }

    const stepRows = await db
      .select()
      .from(nextSteps)
      .where(and(inArray(nextSteps.patientId, patientIds), eq(nextSteps.status, "pending")));

    const stepsByPatient = new Map<number, typeof stepRows>();
    for (const step of stepRows) {
      const list = stepsByPatient.get(step.patientId) ?? [];
      list.push(step);
      stepsByPatient.set(step.patientId, list);
    }

    for (const patient of patientRows) {
      const latest = latestUpdateByPatient.get(patient.id);
      if (!latest) continue;
      records.push({
        id: patient.id,
        patient: patient.name,
        date: latest.syncDate,
        metric: latest.metricLabel,
        value: latest.metricValue,
        improvement: latest.improvementPct ?? 0,
        status: STATUS_LABEL[latest.status],
        nextSteps: (stepsByPatient.get(patient.id) ?? []).map((step) => ({
          id: step.id,
          description: step.description,
          dueLabel: step.dueLabel,
          category: step.category,
        })),
      });
    }
  }

  const [settings] = await db
    .select()
    .from(driveSettings)
    .where(eq(driveSettings.userId, user.id))
    .limit(1);

  return (
    <DashboardClient
      doctorName={user.name.split(" ")[0] ?? user.name}
      initialRecords={records}
      hasFolderConfigured={Boolean(settings)}
      lastSync={settings?.lastSyncedAt ?? null}
    />
  );
}
