"use client";

import { ChangeEvent, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type RecordItem = {
  patient: string;
  date: string;
  metric: string;
  value: number;
  improvement: number;
  nextStep: string;
  due: string;
  status: "Hoje" | "Esta semana" | "Acompanhar";
};

const demo: RecordItem[] = [
  { patient: "Paciente 01", date: "2026-08-10", metric: "Indicador principal", value: 72, improvement: 12, nextStep: "Revisar resultado do exame", due: "Hoje, 14:00", status: "Hoje" },
  { patient: "Paciente 02", date: "2026-08-10", metric: "Indicador principal", value: 64, improvement: 8, nextStep: "Confirmar retorno", due: "Hoje, 16:30", status: "Hoje" },
  { patient: "Paciente 03", date: "2026-08-10", metric: "Indicador principal", value: 51, improvement: -4, nextStep: "Solicitar avaliação", due: "Ter, 11:00", status: "Esta semana" },
  { patient: "Paciente 04", date: "2026-08-10", metric: "Indicador principal", value: 81, improvement: 15, nextStep: "Atualizar evolução", due: "Qua, 09:00", status: "Esta semana" },
  { patient: "Paciente 05", date: "2026-08-10", metric: "Indicador principal", value: 60, improvement: 2, nextStep: "Checar pendência", due: "Sex, 10:30", status: "Acompanhar" },
];

const normalize = (key: string) => key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const text = (row: Record<string, unknown>, keys: string[]) => {
  const found = Object.entries(row).find(([key]) => keys.includes(normalize(key)));
  return found ? String(found[1] ?? "").trim() : "";
};
const numeric = (value: string) => Number(value.replace("%", "").replace(",", ".")) || 0;

export default function Home() {
  const [records, setRecords] = useState<RecordItem[]>(demo);
  const [selectedPatient, setSelectedPatient] = useState("Todos os pacientes");
  const [source, setSource] = useState("Dados demonstrativos");
  const [error, setError] = useState("");

  const patients = useMemo(() => ["Todos os pacientes", ...Array.from(new Set(records.map((item) => item.patient)))], [records]);
  const filtered = selectedPatient === "Todos os pacientes" ? records : records.filter((item) => item.patient === selectedPatient);
  const avgImprovement = filtered.length ? filtered.reduce((sum, item) => sum + item.improvement, 0) / filtered.length : 0;
  const improved = filtered.filter((item) => item.improvement > 0).length;
  const needsAttention = filtered.filter((item) => item.improvement <= 0).length;

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
        const parsed = rows.map((row): RecordItem | null => {
          const patient = text(row, ["paciente", "patient", "nome", "id paciente"]);
          if (!patient) return null;
          const statusRaw = text(row, ["status", "prioridade"]);
          const status = /hoje|today/i.test(statusRaw) ? "Hoje" : /semana|week/i.test(statusRaw) ? "Esta semana" : "Acompanhar";
          return {
            patient,
            date: text(row, ["data", "date"]) || "—",
            metric: text(row, ["indicador", "metrica", "métrica", "metric", "exame"]) || "Indicador principal",
            value: numeric(text(row, ["valor", "value", "resultado"])),
            improvement: numeric(text(row, ["melhora", "melhora (%)", "evolucao", "evolução", "improvement"])),
            nextStep: text(row, ["proximo passo", "próximo passo", "acao", "ação", "next step"]) || "Sem próximo passo informado",
            due: text(row, ["prazo", "vencimento", "due", "data acao"]) || "A definir",
            status,
          };
        }).filter((row): row is RecordItem => Boolean(row));
        if (!parsed.length) throw new Error("Nenhuma linha com a coluna Paciente foi encontrada.");
        setRecords(parsed);
        setSelectedPatient("Todos os pacientes");
        setSource(file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível ler esta planilha.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <main>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">+</span><span>clínica<span className="brand-light">.visão</span></span></div>
        <nav>
          <a className="active" href="#dashboard"><span>▦</span> Visão geral</a>
          <a href="#evolucao"><span>↗</span> Evolução diária</a>
          <a href="#proximos"><span>✓</span> Próximos passos</a>
        </nav>
        <div className="side-note"><span className="lock">●</span><p>Dados locais<br/><strong>somente no seu navegador</strong></p></div>
      </aside>

      <section className="content" id="dashboard">
        <header>
          <div><p className="eyebrow">ACOMPANHAMENTO CLÍNICO</p><h1>Bom dia, Arthur.</h1><p className="subtitle">Uma visão objetiva para priorizar o dia.</p></div>
          <label className="upload"><input type="file" accept=".xlsx,.xls,.csv" onChange={loadExcel} />Importar Excel <span>↑</span></label>
        </header>

        <div className="status-row"><span className="live-dot"></span><strong>{source}</strong><span>•</span><span>{records.length} registros carregados</span>{error && <span className="error">{error}</span>}</div>

        <section className="filters"><div><span>Período</span><strong>Última atualização</strong></div><select value={selectedPatient} onChange={(event) => setSelectedPatient(event.target.value)} aria-label="Filtrar por paciente">{patients.map((patient) => <option key={patient}>{patient}</option>)}</select></section>

        <section className="kpis" aria-label="Resumo diário">
          <article><span className="card-label">MELHORA MÉDIA DIÁRIA</span><strong className={avgImprovement >= 0 ? "positive" : "negative"}>{avgImprovement >= 0 ? "+" : ""}{avgImprovement.toFixed(1)}%</strong><small>comparado à atualização anterior</small></article>
          <article><span className="card-label">EM EVOLUÇÃO FAVORÁVEL</span><strong>{improved}<em> / {filtered.length}</em></strong><small>pacientes acompanhados</small></article>
          <article><span className="card-label">REVISÃO NECESSÁRIA</span><strong className={needsAttention ? "attention" : "positive"}>{needsAttention}</strong><small>sem melhora registrada hoje</small></article>
        </section>

        <section className="dashboard-grid" id="evolucao">
          <article className="panel trend"><div className="panel-heading"><div><p className="eyebrow">EVOLUÇÃO DIÁRIA</p><h2>Melhora por paciente</h2></div><span className="legend"><i></i> melhora registrada</span></div><div className="chart" aria-label="Gráfico de evolução diária">{filtered.map((item) => <div className="bar-wrap" key={item.patient}><div className={`bar ${item.improvement < 0 ? "bar-negative" : ""}`} style={{ height: `${Math.max(18, Math.min(100, Math.abs(item.improvement) * 5))}%` }}><span>{item.improvement > 0 ? "+" : ""}{item.improvement}%</span></div><b>{item.patient.replace("Paciente ", "P.")}</b></div>)}</div><p className="chart-note">A leitura depende da coluna <strong>Melhora (%)</strong> da sua planilha; valide sempre o contexto clínico.</p></article>

          <article className="panel activity"><div className="panel-heading"><div><p className="eyebrow">SITUAÇÃO ATUAL</p><h2>Pacientes acompanhados</h2></div><span className="count">{filtered.length}</span></div><div className="patient-list">{filtered.slice(0, 4).map((item) => <div className="patient" key={item.patient}><span className="avatar">{item.patient.replace("Paciente ", "").slice(0, 2)}</span><div><strong>{item.patient}</strong><small>{item.metric}: {item.value || "—"}</small></div><b className={item.improvement > 0 ? "positive" : "attention"}>{item.improvement > 0 ? "+" : ""}{item.improvement}%</b></div>)}</div></article>
        </section>

        <section className="panel next" id="proximos"><div className="panel-heading"><div><p className="eyebrow">PLANO DE AÇÃO</p><h2>Próximos passos</h2></div><span className="muted">ordenado por prioridade</span></div><div className="task-list">{filtered.map((item) => <div className="task" key={`${item.patient}-${item.nextStep}`}><span className={`task-status ${item.status.toLowerCase().replace(" ", "-")}`}>{item.status}</span><div><strong>{item.nextStep}</strong><small>{item.patient} · {item.metric}</small></div><time>{item.due}</time><button aria-label={`Marcar ${item.nextStep} como concluído`}>○</button></div>)}</div></section>

        <section className="template"><div><p className="eyebrow">FORMATO DE IMPORTAÇÃO</p><h2>Use uma planilha simples para começar.</h2><p>Colunas reconhecidas: <strong>Paciente, Data, Indicador, Valor, Melhora (%), Próximo passo, Prazo e Status.</strong></p></div><div className="columns-preview"><span>Paciente</span><span>Melhora (%)</span><span>Próximo passo</span></div></section>
      </section>
    </main>
  );
}
