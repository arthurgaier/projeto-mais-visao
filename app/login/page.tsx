type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "Sessão de login expirou. Tente novamente.",
  token_exchange_failed: "Não foi possível concluir o login com o Google. Tente novamente.",
  missing_refresh_token:
    "O Google não concedeu acesso contínuo ao Drive. Tente novamente e aceite todas as permissões solicitadas.",
  not_allowed: "Essa conta Google não tem acesso a este painel.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const message = error
    ? (ERROR_MESSAGES[error] ?? "Não foi possível fazer login. Tente novamente.")
    : null;

  return (
    <main className="login-screen">
      <div className="login-card">
        <div className="brand">
          <span className="brand-mark">+</span>
          <span>
            clínica<span className="brand-light">.visão</span>
          </span>
        </div>
        <h1>Entrar no painel</h1>
        <p>Acesse com sua conta Google para ver os pacientes acompanhados.</p>
        {message && <p className="login-error">{message}</p>}
        <a className="login-button" href="/api/auth/google/start">
          Entrar com Google
        </a>
      </div>
    </main>
  );
}
