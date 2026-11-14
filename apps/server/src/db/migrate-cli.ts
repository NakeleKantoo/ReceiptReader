import { applyMigrations, closeDb, openDatabase } from './index.ts';
import { env } from '../env.ts';

const db = openDatabase();
const applied = applyMigrations(db);

if (applied.length === 0) {
  console.log(`Banco já atualizado: ${env.DATABASE_PATH}`);
} else {
  console.log(`Migrações aplicadas (${env.DATABASE_PATH}): ${applied.join(', ')}`);
}

closeDb();
db.close();
