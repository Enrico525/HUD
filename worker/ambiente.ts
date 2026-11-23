// Bindings e variáveis do Worker (ver wrangler.jsonc e .env.example).
export interface Ambiente {
  AMBIENTE: string;
  /**
   * Secret: JSON { "<nome>": "<hash da senha>" }. Sem cadastro hoje (app sem login): fica vazio.
   * Tirar alguém daqui revoga o acesso na hora.
   */
  USUARIOS: string;
  /** Secret: chave aleatória (mín. 32 caracteres) que assina os cookies de sessão. Trocar = derrubar todas as sessões. */
  SESSION_SECRET: string;
  OPENAI_MODEL: string;
  /** Secret */
  OPENAI_API_KEY: string;
  DEV_EMAIL?: string;
  LIMITADOR: RateLimit;
}
