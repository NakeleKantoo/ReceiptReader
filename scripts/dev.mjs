#!/usr/bin/env node
/**
 * `npm run dev` — sobe API + Expo juntos, já apontando o app para o IP da máquina.
 *
 *   npm run dev                 # detecta o IP da LAN
 *   API_HOST=192.168.1.5 npm run dev
 *   API_URL=http://10.0.0.9:3030 npm run dev
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath: o caminho do projeto pode ter espaços (%20 na URL)
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = process.env.PORT ?? '3030';

const c = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  bold: '\u001b[1m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  magenta: '\u001b[35m',
};

function detectLanIp() {
  const candidates = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      // ignora docker/virtualbox/vpn por padrão
      if (/^(docker|br-|veth|virbr|tun|tap|utun|zt)/i.test(name)) continue;
      candidates.push(address.address);
    }
  }

  return candidates.find((ip) => ip.startsWith('192.168.')) ?? candidates[0] ?? '127.0.0.1';
}

const apiUrl = process.env.API_URL ?? `http://${process.env.API_HOST ?? detectLanIp()}:${PORT}`;

// garante o .env do servidor (não versionado)
const envPath = join(root, 'apps/server/.env');
if (!existsSync(envPath)) {
  copyFileSync(join(root, 'apps/server/.env.example'), envPath);
  console.log(`${c.dim}criado apps/server/.env a partir do exemplo${c.reset}`);
}

const children = [];

function run(name, color, command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  const prefix = `${color}${name.padEnd(7)}${c.reset} ${c.dim}│${c.reset} `;
  const pipe = (stream, target) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) target.write(`${prefix}${line}\n`);
    });
  };

  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`${prefix}saiu com código ${code}`);
    }
  });

  children.push(child);
  return child;
}

console.log(`
${c.bold}${c.cyan}Quanto — ambiente de desenvolvimento${c.reset}

  ${c.green}API${c.reset}      ${apiUrl}
  ${c.green}App${c.reset}      Expo Go → escaneie o QR abaixo
  ${c.green}Endereço${c.reset} ${c.bold}${apiUrl}${c.reset} ${c.dim}(digite isso na primeira tela do app)${c.reset}
  ${c.green}Banco${c.reset}    apps/server/data/quanto.db
`);

run('servidor', c.cyan, 'npm', ['run', 'dev'], join(root, 'apps/server'), {
  PORT,
  HOST: '0.0.0.0',
  DATABASE_PATH: './data/quanto.db',
});

run('expo', c.magenta, 'npx', ['expo', 'start', '--lan'], join(root, 'apps/mobile'), {
  EXPO_PUBLIC_API_URL: apiUrl,
});

function shutdown(signal) {
  console.log(`\n${c.dim}${signal} — encerrando...${c.reset}`);
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 400);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
