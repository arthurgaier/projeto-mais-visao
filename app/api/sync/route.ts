import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, getUserById } from "../../../db";
import {
  driveSettings,
  nextSteps,
  patientDailyUpdates,
  patients,
  syncRuns,
} from "../../../db/schema";
import { requireUser } from "../../../lib/session";
import { downloadDriveFile, getValidAccessToken, listDriveDocxFiles } from "../../../lib/google-drive";
import { extractTextFromDocx } from "../../../lib/docx";
import { extractPatientUpdate } from "../../../lib/extract";

export const dynamic = "force-dynamic";

export async function POST() {
  const sessionUser = await requireUser();
  const user = await getUserById(sessionUser.id);
  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 401 });
  }

  const db = getDb();
  const [settings] = await db
    .select()
    .from(driveSettings)
    .where(eq(driveSettings.userId, user.id))
    .limit(1);

  if (!settings) {
    return NextResponse.json(
      { error: "Nenhuma pasta do Drive configurada ainda. Configure em /settings." },
      { status: 400 },
    );
  }

  const [run] = await db
    .insert(syncRuns)
    .values({ userId: user.id, status: "running" })
    .returning();

  try {
    const accessToken = await getValidAccessToken(user);
    const files = await listDriveDocxFiles(
      accessToken,
      settings.folderId,
      settings.lastSyncedAt ?? undefined,
    );

    const syncDate = new Date().toISOString().slice(0, 10);
    const processedPatients: string[] = [];

    for (const file of files) {
      const buffer = await downloadDriveFile(accessToken, file.id);
      const noteText = extractTextFromDocx(buffer);
      const extraction = await extractPatientUpdate(noteText);

      const [patient] = await db
        .insert(patients)
        .values({ userId: user.id, driveFileId: file.id, name: file.name.replace(/\.docx$/i, "") })
        .onConflictDoUpdate({
          target: patients.driveFileId,
          set: { name: file.name.replace(/\.docx$/i, "") },
        })
        .returning();

      const [update] = await db
        .insert(patientDailyUpdates)
        .values({
          patientId: patient.id,
          syncDate,
          metricLabel: extraction.metricLabel,
          metricValue: extraction.metricValue,
          improvementPct: extraction.improvementPct,
          status: extraction.status,
          summaryText: extraction.summary,
        })
        .returning();

      await db
        .update(nextSteps)
        .set({ status: "superseded" })
        .where(and(eq(nextSteps.patientId, patient.id), eq(nextSteps.status, "pending")));

      if (extraction.nextSteps.length > 0) {
        await db.insert(nextSteps).values(
          extraction.nextSteps.map((step) => ({
            patientId: patient.id,
            description: step.description,
            dueLabel: step.dueLabel,
            dueDate: step.dueDate,
            category: step.category,
            sourceUpdateId: update.id,
          })),
        );
      }

      processedPatients.push(patient.name);
    }

    await db
      .update(driveSettings)
      .set({ lastSyncedAt: new Date().toISOString() })
      .where(eq(driveSettings.id, settings.id));

    await db
      .update(syncRuns)
      .set({ status: "success", finishedAt: new Date().toISOString(), filesProcessed: files.length })
      .where(eq(syncRuns.id, run.id));

    return NextResponse.json({ filesProcessed: files.length, patients: processedPatients });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido durante a sincronização.";
    await db
      .update(syncRuns)
      .set({ status: "error", finishedAt: new Date().toISOString(), error: message })
      .where(eq(syncRuns.id, run.id));

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
