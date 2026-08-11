import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { driveSettings, syncRuns } from "../../db/schema";
import { requireUser } from "../../lib/session";

export const dynamic = "force-dynamic";

type SettingsPageProps = {
  searchParams: Promise<{ success?: string; error?: string }>;
};

const STATUS_LABEL: Record<string, string> = {
  running: "Em andamento",
  success: "Concluída",
  error: "Falhou",
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await requireUser();
  const { success, error } = await searchParams;

  const db = getDb();
  const [settings] = await db
    .select()
    .from(driveSettings)
    .where(eq(driveSettings.userId, user.id))
    .limit(1);
  const runs = await db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.userId, user.id))
    .orderBy(desc(syncRuns.startedAt))
    .limit(10);

  return (
    <main className="settings-screen">
      <div className="settings-card">
        <Link className="back-link" href="/">
          ← Voltar ao painel
        </Link>
        <h1>Configurações</h1>
        <p className="subtitle">Escolha a pasta do Google Drive com os arquivos dos pacientes.</p>

        {success && <p className="settings-success">Pasta salva com sucesso.</p>}
        {error && <p className="settings-error">Não foi possível salvar: {error}</p>}

        {settings && (
          <p className="settings-current">
            Pasta atual: <strong>{settings.folderName ?? settings.folderId}</strong>
            {settings.lastSyncedAt && <> · última sincronização em {settings.lastSyncedAt}</>}
          </p>
        )}

        <form action="/api/settings/drive-folder" method="post" className="settings-form">
          <label htmlFor="folderLink">Link ou ID da pasta no Drive</label>
          <input
            id="folderLink"
            name="folderLink"
            type="text"
            placeholder="https://drive.google.com/drive/folders/..."
            required
          />
          <button type="submit">Salvar pasta</button>
        </form>

        <h2>Histórico de sincronizações</h2>
        {runs.length === 0 ? (
          <p className="muted">Nenhuma sincronização ainda.</p>
        ) : (
          <table className="settings-table">
            <thead>
              <tr>
                <th>Início</th>
                <th>Status</th>
                <th>Arquivos</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.startedAt}</td>
                  <td>{STATUS_LABEL[run.status] ?? run.status}</td>
                  <td>{run.filesProcessed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
