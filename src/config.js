import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 3000,
  timeoutMs: Number(process.env.REQUEST_TIMEOUT_MS) || 15000,
  concurrency: Number(process.env.CONCURRENCY) || 5,
};
