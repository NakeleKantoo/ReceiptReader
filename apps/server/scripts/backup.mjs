#!/usr/bin/env node
/**
 * Backup do banco do Quanto.
 *
 *   node scripts/backup.mjs                  # ./data/quanto.db → ./data/backups/
 *   node scripts/backup.mjs --keep 30
 *   DB_PATH=/caminho/quanto.db node scripts/backup.mjs
 *
 * `VACUUM INTO` gera uma cópia consistente mesmo com o servidor escrevendo
 * (WAL permite leitura concorrente). O backup é validado abrindo o arquivo e
 * contando as casas — backup que não abre não é backup.
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const keepIndex = args.indexOf('--keep');
const keep = keepIndex >= 0 ? Number(args[keepIndex + 1] ?? 14) : 14;

const dbPath = resolve(process.env.DB_PATH ?? './apps/server/data/quanto.db');
const outDir = join(dirname(dbPath), 'backups');

function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

if (!existsSync(dbPath)) {
  console.error(`❌ banco não encontrado: ${dbPath}`);
  console.error('   aponte com DB_PATH=/caminho/quanto.db (no Docker costuma ser ./data/quanto.db)');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const target = join(outDir, `quanto-${stamp()}.db`);

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();

// validação: abre o backup e confere o conteúdo
const check = new Database(target, { readonly: true });
const households = check.prepare('SELECT COUNT(*) AS total FROM households').get().total;
const items = check.prepare('SELECT COUNT(*) AS total FROM items').get().total;
const movements = check.prepare('SELECT COUNT(*) AS total FROM movements').get().total;
const schema = check.pragma('user_version', { simple: true });
check.close();

const size = (statSync(target).size / 1024).toFixed(0);
console.log(`✅ ${target}`);
console.log(`   ${size} KB · schema v${schema} · ${households} casa(s) · ${items} item(ns) · ${movements} movimentação(ões)`);

if (items === 0 && movements === 0) {
  console.log('   ⚠ backup sem itens nem movimentações — confira se apontou para o banco certo');
}

// retenção
const backups = readdirSync(outDir)
  .filter((name) => /^quanto-\d{8}-\d{6}\.db$/.test(name))
  .sort()
  .reverse();

for (const old of backups.slice(keep)) {
  rmSync(join(outDir, old));
}

console.log(`   ${Math.min(backups.length, keep)} backup(s) mantido(s) em ${outDir}`);
