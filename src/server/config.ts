import { fileURLToPath } from 'node:url';

export type Config = {
  dataDir: string;
  port: number;
  publicUrl: string | null;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  telegramThreadId: string | null;
  migrationsDir: string;
  /** Built web UI; served only when it contains index.html. */
  webDir: string;
  /** Refuse requests to private networks from notification channels (COINIO_BLOCK_PRIVATE_NETWORKS). */
  blockPrivateNetworks: boolean;
  /** Per-user caps; null means no limit (COINIO_MAX_SUBSCRIPTIONS, COINIO_MAX_CHANNELS, COINIO_MAX_API_KEYS). */
  limits: { maxSubscriptions: number | null; maxChannels: number | null; maxApiKeys: number | null };
};

type Env = Record<string, string | undefined>;

const orNull = (v: string | undefined) => (v && v.length > 0 ? v : null);
const limitOf = (v: string | undefined) => {
  const n = Number(orNull(v) ?? NaN);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** OAuth issuers must be https (localhost is allowed for testing); any other public URL leaves OAuth off. */
export function oauthUrlOf(publicUrl: string | null): string | null {
  if (!publicUrl) return null;
  const url = new URL(publicUrl);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return url.protocol === 'https:' || local ? publicUrl : null;
}

export function loadConfig(env: Env = process.env): Config {
  return {
    dataDir: orNull(env.COINIO_DATA_DIR) ?? '/data',
    port: Number(orNull(env.PORT) ?? 8080),
    publicUrl: orNull(env.COINIO_PUBLIC_URL),
    telegramBotToken: orNull(env.COINIO_TELEGRAM_BOT_TOKEN),
    telegramChatId: orNull(env.COINIO_TELEGRAM_CHAT_ID),
    telegramThreadId: orNull(env.COINIO_TELEGRAM_THREAD_ID),
    migrationsDir: fileURLToPath(new URL('./db/migrations', import.meta.url)),
    webDir: orNull(env.COINIO_WEB_DIR) ?? fileURLToPath(new URL('../web', import.meta.url)),
    blockPrivateNetworks: ['1', 'true', 'yes'].includes((env.COINIO_BLOCK_PRIVATE_NETWORKS ?? '').toLowerCase()),
    limits: {
      maxSubscriptions: limitOf(env.COINIO_MAX_SUBSCRIPTIONS),
      maxChannels: limitOf(env.COINIO_MAX_CHANNELS),
      maxApiKeys: limitOf(env.COINIO_MAX_API_KEYS),
    },
  };
}
