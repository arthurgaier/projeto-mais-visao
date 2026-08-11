# Clínica Visão

Painel de acompanhamento clínico para médicos que registram a evolução dos
pacientes em anotações de texto livre (arquivos `.docx` no Google Drive) e
querem uma visão diária organizada, sem precisar preencher planilhas ou
sistemas complexos manualmente.

## A ideia

No dia a dia, o médico escreve uma anotação narrativa sobre cada paciente
("hoje o paciente relatou melhora na dor, pressão em 130x80, retorno marcado
para quinta") e salva como um arquivo `.docx` numa pasta do Google Drive — um
arquivo por paciente.

O Clínica Visão:

1. Lê os arquivos `.docx` dessa pasta;
2. Manda o texto de cada anotação para uma IA, que extrai de forma
   estruturada o indicador clínico principal, o valor, a variação percentual
   de melhora, a urgência (hoje / esta semana / acompanhar), um resumo e os
   próximos passos (exames, retornos, medicações);
3. Mostra tudo isso num dashboard: evolução por paciente, quem precisa de
   atenção hoje, e um plano de ação com os próximos passos pendentes.

Assim o médico continua escrevendo do jeito que já escreve — texto livre —
e o painel organiza isso automaticamente a cada sincronização.

Como alternativa (sem depender do Drive), também é possível importar os
dados manualmente via planilha Excel/CSV direto no navegador.

## Como funciona por baixo dos panos

- **Login**: OAuth com Google (também usado para autorizar leitura do Drive).
- **Configuração**: o médico informa o link da pasta do Drive com os
  arquivos dos pacientes.
- **Sincronização** (botão "Sincronizar agora"): busca só os arquivos
  `.docx` novos ou alterados desde a última sincronização, extrai o texto e
  chama a IA para estruturar os dados, salvando tudo num banco (Cloudflare
  D1 via Drizzle ORM).
- **Dashboard**: lê os dados salvos e mostra o resumo do dia, o gráfico de
  evolução e a lista de próximos passos.

## Stack

- [vinext](https://github.com/cloudflare/vinext) (Next.js rodando em
  Cloudflare Workers) + React
- Cloudflare D1 (SQLite) com Drizzle ORM
- OAuth do Google (login + acesso de leitura ao Drive)
- Extração de texto via IA com tool-calling estruturado (compatível com
  Anthropic ou Groq — ver `lib/extract.ts`)

## Rodando localmente

### Pré-requisitos

- Node.js `>=22.13.0`
- Uma pasta no Google Drive com arquivos `.docx` de teste
- Um OAuth Client ID do Google Cloud Console (tipo "Aplicativo da Web"),
  com o redirect URI `http://localhost:3000/api/auth/google/callback`
- Uma API key de um provedor de IA com tool-calling (Groq tem tier
  gratuito; Anthropic é a opção usada em produção)

### Configuração

Copie `.dev.vars.example` para `.dev.vars` e preencha os valores:

```bash
cp .dev.vars.example .dev.vars
```

### Comandos

```bash
npm install
npm run dev
npm run build
```

- `npm run dev`: inicia o servidor local
- `npm run build`: valida o build de produção
- `npm run db:generate`: gera migrações do Drizzle após mudanças no schema

## Aprenda mais

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
