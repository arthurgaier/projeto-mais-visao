"use client";

import { ChangeEvent, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

export type NextStepItem = {
  id: number;
  description: string;
  dueLabel: string | null;
  category: string | null;
};

export type PatientRecord = {
  id: number;
  patient: string;
  date: string;
  metric: string;
  value: number | null;
  improvement: number;
  status: "Hoje" | "Esta semana" | "Acompanhar";
  nextSteps: NextStepItem[];
};

type DashboardClientProps = {
  doctorName: string;
  initialRecords: PatientRecord[];
  hasFolderConfigured: boolean;
  lastSync: string | null;
};

const normalize = (key: string) =>
  Array.from(key.toLowerCase().normalize("NFD"))
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f; // drop Unicode combining diacritical marks
    })
    .join("")
    .trim();
const text = (row: Record<string, unknown>, keys: string[]) => {
  const found = Object.entries(row).find(([key]) => keys.includes(normalize(key)));
  return found ? String(found[1] ?? "").trim() : "";
};
const numeric = (value: string) => Number(value.replace("%", "").replace(",", ".")) || 0;

export function DashboardClient({
  doctorName,
  initialRecords,
  hasFolderConfigured,
  lastSync,
}: DashboardClientProps) {
  const router = useRouter();
  const [records, setRecords] = useState<PatientRecord[]>(initialRecords);
  const [selectedPatient, setSelectedPatient] = useState("Todos os pacientes");
  const [source, setSource] = useState<"drive" | "excel">("drive");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isSyncing, startSync] = useTransition();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // router.refresh() re-renders this client component with new props, but
  // React keeps the existing `records` state instead of re-reading
  // `initialRecords` — resync it whenever the server sends fresh data.
  useEffect(() => {
    setRecords(initialRecords);
    setSource("drive");
  }, [initialRecords]);

  const patientNames = useMemo(
    () => ["Todos os pacientes", ...Array.from(new Set(records.map((item) => item.patient)))],
    [records],
  );
  const filtered =
    selectedPatient === "Todos os pacientes"
      ? records
      : records.filter((item) => item.patient === selectedPatient);
  const avgImprovement = filtered.length
    ? filtered.reduce((sum, item) => sum + item.improvement, 0) / filtered.length
    : 0;
  const improved = filtered.filter((item) => item.improvement > 0).length;
  const needsAttention = filtered.filter((item) => item.improvement <= 0).length;
  const tasks = filtered.flatMap((item) =>
    item.nextSteps.map((step) => ({
      ...step,
      patient: item.patient,
      metric: item.metric,
      status: item.status,
    })),
  );

  function loadExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const workbook = XLSX.read(loadEvent.target?.result, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
        const parsed = rows
          .map((row, index): PatientRecord | null => {
            const patient = text(row, ["paciente", "patient", "nome", "id paciente"]);
            if (!patient) return null;
            const statusRaw = text(row, ["status", "prioridade"]);
            const status = /hoje|today/i.test(statusRaw)
              ? "Hoje"
              : /semana|week/i.test(statusRaw)
                ? "Esta semana"
                : "Acompanhar";
            const nextStep = text(row, ["proximo passo", "próximo passo", "acao", "ação", "next step"]);
            return {
              id: -(index + 1),
              patient,
              date: text(row, ["data", "date"]) || "—",
              metric: text(row, ["indicador", "metrica", "métrica", "metric", "exame"]) || "Indicador principal",
              value: numeric(text(row, ["valor", "value", "resultado"])),
              improvement: numeric(text(row, ["melhora", "melhora (%)", "evolucao", "evolução", "improvement"])),
              status,
              nextSteps: nextStep
                ? [
                    {
                      id: -(index + 1),
                      description: nextStep,
                      dueLabel: text(row, ["prazo", "vencimento", "due", "data acao"]) || "A definir",
                      category: null,
                    },
                  ]
                : [],
            };
          })
          .filter((row): row is PatientRecord => Boolean(row));
        if (!parsed.length) throw new Error("Nenhuma linha com a coluna Paciente foi encontrada.");
        setRecords(parsed);
        setSelectedPatient("Todos os pacientes");
        setSource("excel");
        setFileName(file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível ler esta planilha.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function syncNow() {
    setSyncMessage(null);
    startSync(async () => {
      try {
        const response = await fetch("/api/sync", { method: "POST" });
        const data = (await response.json()) as {
          filesProcessed?: number;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Falha ao sincronizar.");
        setSyncMessage(
          data.filesProcessed
            ? `${data.filesProcessed} arquivo(s) sincronizado(s).`
            : "Nenhum arquivo novo desde a última sincronização.",
        );
        router.refresh();
      } catch (err) {
        setSyncMessage(err instanceof Error ? err.message : "Falha ao sincronizar.");
      }
    });
  }

  return (
    <main>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">+</span>
          <span>
            clínica<span className="brand-light">.visão</span>
          </span>
        </div>
        <nav>
          <a className="active" href="#dashboard">
            <span>▦</span> Visão geral
          </a>
          <a href="#evolucao">
            <span>↗</span> Evolução diária
          </a>
          <a href="#proximos">
            <span>✓</span> Próximos passos
          </a>
          <Link href="/settings">
            <span>⚙</span> Configurações
          </Link>
        </nav>
        <div className="side-note">
          <span className="lock">●</span>
          <p>
            Dados locais
            <br />
            <strong>somente no seu navegador</strong>
          </p>
        </div>
        <a href="/api/auth/logout" className="logout-link">
          Sair
        </a>
      </aside>

      <section className="content" id="dashboard">
        <header>
          <div>
            <p className="eyebrow">ACOMPANHAMENTO CLÍNICO</p>
            <h1>Bom dia, {doctorName}.</h1>
            <p className="subtitle">Uma visão objetiva para priorizar o dia.</p>
          </div>
          <div className="header-actions">
            <button className="sync-button" onClick={syncNow} disabled={isSyncing}>
              {isSyncing ? "Sincronizando…" : "Sincronizar agora"} <span>⟳</span>
            </button>
            <label className="upload">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={loadExcel} />
              Importar Excel <span>↑</span>
            </label>
          </div>
        </header>

        <div className="status-row">
          <span className="live-dot"></span>
          <strong>{source === "excel" ? fileName : "Google Drive"}</strong>
          <span>•</span>
          <span>{records.length} paciente(s) carregados</span>
          {source === "drive" && lastSync && (
            <>
              <span>•</span>
              <span>última sincronização em {new Date(lastSync).toLocaleString("pt-BR")}</span>
            </>
          )}
          {source === "drive" && !hasFolderConfigured && (
            <>
              <span>•</span>
              <span className="error">
                <Link href="/settings">Configure a pasta do Drive</Link>
              </span>
            </>
          )}
          {syncMessage && (
            <>
              <span>•</span>
              <span>{syncMessage}</span>
            </>
          )}
          {error && <span className="error">{error}</span>}
        </div>

        {records.length === 0 ? (
          <section className="empty-state">
            <p className="eyebrow">SEM DADOS AINDA</p>
            <h2>Nenhum paciente sincronizado.</h2>
            <p>
              {hasFolderConfigured
                ? "Clique em \"Sincronizar agora\" para ler as anotações mais recentes do Drive."
                : "Configure a pasta do Drive com os arquivos dos pacientes para começar."}
            </p>
            {!hasFolderConfigured && <Link href="/settings">Ir para configurações</Link>}
          </section>
        ) : (
          <>
            <section className="filters">
              <div>
                <span>Período</span>
                <strong>Última atualização</strong>
              </div>
              <select
                value={selectedPatient}
                onChange={(event) => setSelectedPatient(event.target.value)}
                aria-label="Filtrar por paciente"
              >
                {patientNames.map((patient) => (
                  <option key={patient}>{patient}</option>
                ))}
              </select>
            </section>

            <section className="kpis" aria-label="Resumo diário">
              <article>
                <span className="card-label">MELHORA MÉDIA DIÁRIA</span>
                <strong className={avgImprovement >= 0 ? "positive" : "negative"}>
                  {avgImprovement >= 0 ? "+" : ""}
                  {avgImprovement.toFixed(1)}%
                </strong>
                <small>comparado à atualização anterior</small>
              </article>
              <article>
                <span className="card-label">EM EVOLUÇÃO FAVORÁVEL</span>
                <strong>
                  {improved}
                  <em> / {filtered.length}</em>
                </strong>
                <small>pacientes acompanhados</small>
              </article>
              <article>
                <span className="card-label">REVISÃO NECESSÁRIA</span>
                <strong className={needsAttention ? "attention" : "positive"}>{needsAttention}</strong>
                <small>sem melhora registrada hoje</small>
              </article>
            </section>

            <section className="dashboard-grid" id="evolucao">
              <article className="panel trend">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">EVOLUÇÃO DIÁRIA</p>
                    <h2>Melhora por paciente</h2>
                  </div>
                  <span className="legend">
                    <i></i> melhora registrada
                  </span>
                </div>
                <div className="chart" aria-label="Gráfico de evolução diária">
                  {filtered.map((item) => (
                    <div className="bar-wrap" key={item.id}>
                      <div
                        className={`bar ${item.improvement < 0 ? "bar-negative" : ""}`}
                        style={{ height: `${Math.max(18, Math.min(100, Math.abs(item.improvement) * 5))}%` }}
                      >
                        <span>
                          {item.improvement > 0 ? "+" : ""}
                          {item.improvement}%
                        </span>
                      </div>
                      <b>{item.patient}</b>
                    </div>
                  ))}
                </div>
                <p className="chart-note">
                  A leitura depende da <strong>% de melhora</strong> extraída da anotação; valide sempre o
                  contexto clínico.
                </p>
              </article>

              <article className="panel activity">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">SITUAÇÃO ATUAL</p>
                    <h2>Pacientes acompanhados</h2>
                  </div>
                  <span className="count">{filtered.length}</span>
                </div>
                <div className="patient-list">
                  {filtered.slice(0, 6).map((item) => (
                    <div className="patient" key={item.id}>
                      <span className="avatar">{item.patient.slice(0, 2).toUpperCase()}</span>
                      <div>
                        <strong>{item.patient}</strong>
                        <small>
                          {item.metric}: {item.value ?? "—"}
                        </small>
                      </div>
                      <b className={item.improvement > 0 ? "positive" : "attention"}>
                        {item.improvement > 0 ? "+" : ""}
                        {item.improvement}%
                      </b>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="panel next" id="proximos">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">PLANO DE AÇÃO</p>
                  <h2>Próximos passos</h2>
                </div>
                <span className="muted">ordenado por prioridade</span>
              </div>
              <div className="task-list">
                {tasks.length === 0 && <p className="muted">Nenhum próximo passo pendente.</p>}
                {tasks.map((step) => (
                  <div className="task" key={step.id}>
                    <span className={`task-status ${step.status.toLowerCase().replace(" ", "-")}`}>
                      {step.status}
                    </span>
                    <div>
                      <strong>{step.description}</strong>
                      <small>
                        {step.patient} · {step.metric}
                      </small>
                    </div>
                    <time>{step.dueLabel ?? "A definir"}</time>
                    <button aria-label={`Marcar ${step.description} como concluído`}>○</button>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <section className="template">
          <div>
            <p className="eyebrow">FORMATO DE IMPORTAÇÃO MANUAL</p>
            <h2>Alternativa: planilha simples.</h2>
            <p>
              Colunas reconhecidas:{" "}
              <strong>Paciente, Data, Indicador, Valor, Melhora (%), Próximo passo, Prazo e Status.</strong>
            </p>
          </div>
          <div className="columns-preview">
            <span>Paciente</span>
            <span>Melhora (%)</span>
            <span>Próximo passo</span>
          </div>
        </section>
      </section>
    </main>
  );
}
