#!/usr/bin/env node
/**
 * Confere uma instalação do Quanto de fora, do jeito que o celular vê.
 *
 *   node scripts/check-deploy.mjs https://quanto.leonnaviegas.dev.br
 *   node scripts/check-deploy.mjs http://192.168.1.5:3030
 *
 * Verifica: HTTPS válido e sua validade, health, status público, protocolo de
 * sync e se o servidor recusa requisição sem token (não pode ser aberto).
 */
import { connect } from 'node:tls';

const target = (process.argv[2] ?? 'https://quanto.leonnaviegas.dev.br').replace(/\/+$/, '');
const url = new URL(target);

let failures = 0;

function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` → ${detail}` : ''}`);
}

function certificateInfo(hostname, port) {
  return new Promise((resolve) => {
    if (port !== 443) return resolve(null);

    const socket = connect({ host: hostname, port, servername: hostname, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
      const days = validTo ? Math.round((validTo.getTime() - Date.now()) / 86_400_000) : null;
      socket.end();
      resolve({ authorized: socket.authorized, days, issuer: cert?.issuer?.O ?? null });
    });

    socket.on('error', () => resolve(null));
    socket.setTimeout(8000, () => {
      socket.destroy();
      resolve(null);
    });
  });
}

async function main() {
  console.log(`\n▶ conferindo ${target}\n`);
  console.log('transporte');

  const cert = await certificateInfo(url.hostname, Number(url.port || (url.protocol === 'https:' ? 443 : 80)));

  if (url.protocol === 'https:') {
    check('conexão TLS na porta 443', cert !== null, cert === null ? 'sem resposta (DNS ou porta fechada)' : '');
    if (cert) {
      check('certificado confiável', cert.authorized === true, cert.authorized ? '' : 'não validado pelo sistema');
      if (cert.days !== null) check(`certificado válido por ${cert.days} dia(s)`, cert.days > 14, cert.issuer ?? '');
    }
  } else {
    console.log('  ⚠ http:// — serve para testar na LAN, mas o celular fora de casa precisa de HTTPS');
  }

  console.log('\napi');
  let health = null;
  try {
    const response = await fetch(`${target}/api/health`, { signal: AbortSignal.timeout(10000) });
    health = { status: response.status, body: await response.json().catch(() => null) };
  } catch (error) {
    check('GET /api/health', false, error.message);
  }

  if (health) check('GET /api/health responde 200', health.status === 200, `status ${health.status}`);

  let status = null;
  try {
    const response = await fetch(`${target}/api/public/status`, { signal: AbortSignal.timeout(10000) });
    status = { status: response.status, body: await response.json().catch(() => null) };
  } catch (error) {
    check('GET /api/public/status', false, error.message);
  }

  if (status) {
    check('GET /api/public/status responde 200', status.status === 200);
    check('protocolo de sync anunciado', typeof status.body?.protocol === 'number', `protocolo ${status.body?.protocol}`);
    if (status.body?.initialized) {
      check(
        'casa configurada',
        true,
        `${status.body.householdName} · ${status.body.memberCount}/${status.body.maxMembers} pessoas`,
      );
    } else {
      console.log('  ⚠ servidor sem casa ainda — abra o app e crie a casa');
    }
  }

  console.log('\nsegurança');
  const open = await fetch(`${target}/api/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ protocol: 999, cursor: {}, changes: {} }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);

  check('sync sem token é recusado', open?.status === 401, `status ${open?.status ?? 'sem resposta'}`);

  console.log(failures === 0 ? '\n✅ tudo certo\n' : `\n❌ ${failures} problema(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\n💥', error.message);
  process.exit(1);
});
