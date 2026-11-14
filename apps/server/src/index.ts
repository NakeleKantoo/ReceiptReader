import { createApp } from './app.ts';
import { closeDb, getDb } from './db/index.ts';
import { env } from './env.ts';

const db = getDb();
const app = createApp(db);

const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`Quanto API em http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
  console.log(`Banco: ${env.DATABASE_PATH}`);
});

function shutdown(signal: string): void {
  console.log(`\n${signal} recebido, encerrando...`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
