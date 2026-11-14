#!/usr/bin/env node
/**
 * Smoke test da API — sobe contra um servidor já rodando.
 *
 *   DATABASE_PATH=./data/smoke.db PORT=3999 npm start
 *   node scripts/smoke.mjs http://127.0.0.1:3999
 *
 * Cobre a F0: bootstrap, convite, login por PIN, unicidade do PIN, sync entre
 * dois membros, autorização e rate limit.
 */

const base = process.argv[2] ?? 'http://127.0.0.1:3999';

let passed = 0;
let failed = 0;

function check(label, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label}${extra ? ` → ${JSON.stringify(extra)}` : ''}`);
  }
}

async function api(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    /* corpo vazio */
  }

  return { status: response.status, body: json };
}

const run = async () => {
  console.log(`\n▶ smoke test em ${base}\n`);

  console.log('saúde e status público');
  const health = await api('/api/health');
  check('GET /api/health responde 200', health.status === 200, health);

  const status = await api('/api/public/status');
  check('GET /api/public/status responde 200', status.status === 200, status);
  check('casa ainda não inicializada', status.body?.initialized === false, status.body);

  console.log('\nbootstrap da casa');
  const bootstrap = await api('/api/household', {
    method: 'POST',
    body: {
      householdName: 'Casa Teste',
      name: 'Ana',
      secret: '123456',
      deviceName: 'smoke-test',
    },
  });
  check('POST /api/household cria a casa (201)', bootstrap.status === 201, bootstrap);
  const adminToken = bootstrap.body?.token;
  check('admin recebe token', typeof adminToken === 'string' && adminToken.length > 20);
  check('admin é role admin', bootstrap.body?.user?.role === 'admin', bootstrap.body?.user);

  const second = await api('/api/household', {
    method: 'POST',
    body: { householdName: 'Outra', name: 'X', secret: '654321' },
  });
  check('segundo bootstrap é rejeitado (409)', second.status === 409, second);

  console.log('\nautenticação por PIN');
  const badLogin = await api('/api/auth/login', { method: 'POST', body: { secret: '999999' } });
  check('PIN errado → 401', badLogin.status === 401, badLogin);

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { secret: '123456', deviceName: 'smoke-test-2' },
  });
  check('PIN certo → 200 com token', login.status === 200 && Boolean(login.body?.token), login);
  check('login não devolve hash', !JSON.stringify(login.body).includes('scrypt$'));

  const me = await api('/api/auth/me', { token: adminToken });
  check('GET /api/auth/meautenticado', me.status === 200 && me.body?.user?.name === 'Ana', me);

  const noToken = await api('/api/auth/me');
  check('sem token → 401', noToken.status === 401, noToken);

  const badToken = await api('/api/auth/me', { token: 'inventado' });
  check('token inválido → 401', badToken.status === 401, badToken);

  console.log('\nconvite e entrada de membro');
  const invite = await api('/api/household/invite', { method: 'POST', token: adminToken });
  check('admin gera convite', invite.status === 200 && Boolean(invite.body?.inviteCode), invite);
  const inviteCode = invite.body?.inviteCode;

  const join = await api('/api/household/join', {
    method: 'POST',
    body: { inviteCode, name: 'Bruno', secret: 'abcdefgh', deviceName: 'smoke-test-3' },
  });
  check('membro entra com convite (201)', join.status === 201, join);
  const memberToken = join.body?.token;
  check('membro é role member', join.body?.user?.role === 'member', join.body?.user);

  const duplicatePin = await api('/api/household/join', {
    method: 'POST',
    body: { inviteCode, name: 'Carla', secret: '123456' },
  });
  check('PIN repetido é recusado (409)', duplicatePin.status === 409, duplicatePin);
  check('código do erro é secret_taken', duplicatePin.body?.code === 'secret_taken', duplicatePin.body);

  const badInvite = await api('/api/household/join', {
    method: 'POST',
    body: { inviteCode: 'ZZZZZZ', name: 'D', secret: 'senha1234' },
  });
  check('convite inválido → 404', badInvite.status === 404, badInvite);

  console.log('\npermissões');
  const memberInvite = await api('/api/household/invite', { method: 'POST', token: memberToken });
  check('membro não gera convite (403)', memberInvite.status === 403, memberInvite);

  const household = await api('/api/household', { token: adminToken });
  check('lista 2 membros', household.body?.members?.length === 2, household.body?.members);
  check('admin vê o código de convite', Boolean(household.body?.household?.inviteCode));
  check('admin não vê hash de senha', !JSON.stringify(household.body).includes('scrypt$'));

  console.log('\nsync entre dois aparelhos');
  const now = Date.now();
  const locationId = crypto.randomUUID();
  const push = await api('/api/sync', {
    method: 'POST',
    token: adminToken,
    body: {
      cursor: { categories: 0, locations: 0 },
      changes: {
        locations: [
          {
            id: locationId,
            name: 'Despensa',
            parentId: null,
            icon: 'pantry',
            notes: null,
            sortOrder: 0,
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
    },
  });
  check('push aceito', push.status === 200 && push.body?.cursor?.locations > 0, push);
  check('push foi aplicado', push.body?.changes?.locations?.length === 1, push.body?.changes);

  const pullMember = await api('/api/sync', {
    method: 'POST',
    token: memberToken,
    body: { cursor: { categories: 0, locations: 0 }, changes: {} },
  });
  const pulledLocation = pullMember.body?.changes?.locations?.[0];
  check('membro recebe o local da Ana', pulledLocation?.id === locationId, pullMember.body?.changes);
  check('local veio com rev', pulledLocation?.rev > 0, pulledLocation);

  const cursor = pullMember.body?.cursor;
  const emptyPull = await api('/api/sync', {
    method: 'POST',
    token: memberToken,
    body: { cursor, changes: {} },
  });
  check('pull com cursor atual não repete linhas', emptyPull.body?.changes?.locations?.length === 0, emptyPull.body?.changes);

  const rename = await api('/api/sync', {
    method: 'POST',
    token: memberToken,
    body: {
      cursor,
      changes: {
        locations: [
          {
            ...pulledLocation,
            name: 'Despensa da cozinha',
            updatedAt: Date.now() + 10,
          },
        ],
      },
    },
  });
  check('membro renomeia o local', rename.status === 200, rename);

  const adminPull = await api('/api/sync', {
    method: 'POST',
    token: adminToken,
    body: { cursor: { categories: 0, locations: 0 }, changes: {} },
  });
  check(
    'Ana vê o nome novo',
    adminPull.body?.changes?.locations?.[0]?.name === 'Despensa da cozinha',
    adminPull.body?.changes?.locations,
  );

  const stalePush = await api('/api/sync', {
    method: 'POST',
    token: adminToken,
    body: {
      cursor: { categories: 0, locations: 0 },
      changes: {
        locations: [{ ...pulledLocation, name: 'Nome antigo', updatedAt: now }],
      },
    },
  });
  const afterStale = await api('/api/sync', {
    method: 'POST',
    token: adminToken,
    body: { cursor: stalePush.body?.cursor, changes: {} },
  });
  check(
    'edição mais antiga não sobrescreve (LWW)',
    afterStale.body?.changes?.locations?.length === 0,
    afterStale.body?.changes,
  );

  const deleted = await api('/api/sync', {
    method: 'POST',
    token: adminToken,
    body: {
      cursor: { categories: 0, locations: 0 },
      changes: {
        locations: [
          {
            id: locationId,
            name: 'Despensa da cozinha',
            deletedAt: Date.now(),
            createdAt: now,
            updatedAt: Date.now() + 1000,
          },
        ],
      },
    },
  });
  check('delete vira tombstone e propaga', deleted.status === 200, deleted);

  const tenantIsolation = await api('/api/sync', {
    method: 'POST',
    token: memberToken,
    body: {
      cursor: { categories: 0, locations: 0 },
      changes: {
        locations: [
          {
            id: crypto.randomUUID(),
            name: 'Invasão',
            createdAt: now,
            updatedAt: now,
            householdId: 'outra-casa',
          },
        ],
      },
    },
  });
  check('householdId enviado pelo cliente é ignorado', tenantIsolation.status === 200);

  console.log('\ntroca de PIN');
  const changeSecret = await api('/api/household/me/secret', {
    method: 'POST',
    token: memberToken,
    body: { secret: 'novopin1' },
  });
  check('membro troca o próprio PIN', changeSecret.status === 200, changeSecret);

  const oldLogin = await api('/api/auth/login', { method: 'POST', body: { secret: 'abcdefgh' } });
  check('PIN antigo não funciona mais', oldLogin.status === 401, oldLogin);
  const newLogin = await api('/api/auth/login', { method: 'POST', body: { secret: 'novopin1' } });
  check('PIN novo funciona', newLogin.status === 200, newLogin);

  console.log('\nlogout');
  const logout = await api('/api/auth/logout', { method: 'POST', token: newLogin.body?.token });
  check('logout responde 200', logout.status === 200, logout);
  const afterLogout = await api('/api/auth/me', { token: newLogin.body?.token });
  check('token revogado não funciona', afterLogout.status === 401, afterLogout);

  console.log('\nrate limit');
  let limited = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await api('/api/auth/login', { method: 'POST', body: { secret: `senhaerrada${attempt}` } });
    if (response.status === 429) {
      limited = response;
      break;
    }
  }
  check('força bruta é bloqueada (429)', limited?.status === 429, limited);

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passaram, ${failed} falharam\n`);
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error('\n💥 erro no smoke test:', error);
  process.exit(1);
});
