import { env } from "cloudflare:workers";

export type NextStepExtraction = {
  description: string;
  dueLabel: string | null;
  dueDate: string | null;
  category: string | null;
};

export type PatientExtraction = {
  metricLabel: string;
  metricValue: number | null;
  improvementPct: number | null;
  status: "hoje" | "esta-semana" | "acompanhar";
  summary: string;
  nextSteps: NextStepExtraction[];
};

const EXTRACTION_TOOL = {
  type: "function",
  function: {
    name: "record_patient_update",
    description:
      "Registra o estado atual de um paciente extraído da anotação clínica em texto livre.",
    parameters: {
      type: "object",
      properties: {
        metricLabel: {
          type: "string",
          description:
            "Nome do indicador clínico principal mencionado na anotação (ex: 'Pressão arterial', 'Escala de dor'). Use 'Indicador principal' se nenhum for claro.",
        },
        metricValue: {
          type: ["number", "null"],
          description:
            "Valor numérico mais recente do indicador principal, se houver um explícito no texto.",
        },
        improvementPct: {
          type: ["number", "null"],
          description:
            "Variação percentual de melhora desde a última anotação, positiva ou negativa, se possível estimar a partir do texto. Nulo se não houver base de comparação.",
        },
        status: {
          type: "string",
          enum: ["hoje", "esta-semana", "acompanhar"],
          description:
            "Urgência do próximo passo mais próximo: 'hoje' se algo precisa acontecer hoje, 'esta-semana' se nos próximos dias, 'acompanhar' se é rotina sem prazo definido.",
        },
        summary: {
          type: "string",
          description: "Resumo objetivo de 1 a 2 frases do estado atual do paciente, em português.",
        },
        nextSteps: {
          type: "array",
          description: "Próximos passos ou tarefas pendentes (exames, retornos, ações) mencionados no texto.",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              dueLabel: {
                type: ["string", "null"],
                description: "Prazo em linguagem natural, ex: 'Hoje, 14:00' ou 'Terça, 11:00'.",
              },
              dueDate: {
                type: ["string", "null"],
                description: "Data no formato ISO 8601 (YYYY-MM-DD) se puder ser inferida, senão nulo.",
              },
              category: {
                type: ["string", "null"],
                description: "Categoria curta, ex: 'exame', 'retorno', 'medicação'.",
              },
            },
            required: ["description"],
          },
        },
      },
      required: ["metricLabel", "status", "summary", "nextSteps"],
    },
  },
};

// Free-tier testing provider (console.groq.com). Swap back to the Anthropic
// Messages API for production once billing is set up.
const MODEL = "llama-3.3-70b-versatile";

export async function extractPatientUpdate(noteText: string): Promise<PatientExtraction> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente que lê anotações clínicas narrativas escritas por um médico sobre UM paciente e extrai o estado atual de forma estruturada, em português. Baseie-se apenas no que está escrito no texto — nunca invente valores, datas ou próximos passos que não estejam explícitos ou claramente implícitos.",
        },
        { role: "user", content: `Anotação clínica:\n\n${noteText}` },
      ],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "function", function: { name: "record_patient_update" } },
    }),
  });

  if (!response.ok) {
    throw new Error(`Chamada à API da Groq falhou: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    choices: Array<{
      message: { tool_calls?: Array<{ function: { arguments: string } }> };
    }>;
  };
  const toolCall = data.choices[0]?.message.tool_calls?.[0];
  if (!toolCall) {
    throw new Error("A resposta da LLM não incluiu a extração estruturada esperada.");
  }

  return JSON.parse(toolCall.function.arguments) as PatientExtraction;
}
