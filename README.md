# Quanto

Inventário de patrimônio doméstico: o que a sua casa tem, onde está, com quem está e por quanto.

App Android em **React Native + Expo**, servidor próprio em **Node + SQLite**. Funciona **offline** —
o servidor existe para a família compartilhar dados entre aparelhos.

> Plano completo por fases em [`PLANO.md`](./PLANO.md). Este README cobre o que **já funciona (F0)**.

---

## Estrutura

```
apps/
  mobile/    app Expo (expo-router, expo-sqlite, expo-secure-store)
  server/    API Express + better-sqlite3
packages/
  core/      DDL compartilhado, tipos das linhas, contratos zod, unidades e dinheiro
```

`packages/core` é a fonte única: a **mesma** DDL roda no SQLite do aparelho e no do servidor.
Quantidade é sempre inteiro na unidade base (`500 g`) e dinheiro é sempre centavos.

---

## Servidor

### Rodando local

```bash
npm install                      # app + core
npm run server:install           # dependências do servidor
cp apps/server/.env.example apps/server/.env
npm run dev:server               # http://localhost:3030
```

### Rodando com Docker

```bash
docker compose up -d --build
docker compose logs -f quanto
```

O banco fica em `./data/quanto.db` (volume). Backup:

```bash
docker compose exec quanto node -e "require('better-sqlite3')('/data/quanto.db').exec(\"VACUUM INTO '/data/backup-' + Date.now() + '.db'\")"
```

### HTTPS (necessário para o app fora da rede local)

O app já aponta para `https://quanto.leonnaviegas.dev.br`. Com **Caddy**, três linhas resolvem
(certificado Let's Encrypt automático):

```caddyfile
quanto.leonnaviegas.dev.br {
    reverse_proxy 127.0.0.1:3030
}
```

Com **nginx**:

```nginx
server {
    server_name quanto.leonnaviegas.dev.br;
    location / {
        proxy_pass http://127.0.0.1:3030;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> `TRUST_PROXY=1` já está ligado, então o rate limit usa o IP real do cliente.

### Variáveis

| Variável | Default | Para que serve |
|---|---|---|
| `PORT` | `3030` | porta |
| `DATABASE_PATH` | `./data/quanto.db` | arquivo SQLite |
| `SESSION_TTL_DAYS` | `90` | validade da sessão por aparelho |
| `INVITE_TTL_HOURS` | `24` | validade do código de convite |
| `MAX_MEMBERS` | `5` | limite de pessoas por casa |
| `TRUST_PROXY` | `1` | confiar em `X-Forwarded-For` |

### Teste de fumaça da API

```bash
cd apps/server
rm -f data/smoke.db*
DATABASE_PATH=./data/smoke.db PORT=3999 npm start &
npm run smoke -- http://127.0.0.1:3999
```

Cobre 39 asserções: bootstrap, convite, login por PIN, unicidade do PIN, sync entre dois membros,
LWW, tombstones, isolamento por casa, troca de PIN, logout e rate limit.

---

## App

```bash
cd apps/mobile
cp .env.example .env     # opcional: aponte para http://192.168.1.4:3030 no dev
npx expo start
```

Abra no **Expo Go** (Android). Para gerar o API:

```bash
cd apps/mobile
npx eas build --profile preview --platform android   # gera APK
```

O `eas.json` já define `preview` como APK e `production` como AAB.

> **Guarde o keystore do EAS.** Trocar de keystore impede instalar a atualização por cima do APK antigo.

---

## Como o login funciona

Não existe e-mail. Cada pessoa tem **um segredo só** — PIN de 6 dígitos ou senha de 8+ caracteres —
e é ele que identifica a conta:

- o servidor compara o segredo contra os hashes de **todas** as contas da casa (≤5), em tempo uniforme;
- para isso não gerar ambiguidade, o PIN precisa ser **único na casa** (o servidor responde `409`);
- depois do primeiro login o app abre com **biometria** (Keystore/Keychain);
- 6 dígitos são 10⁶ combinações, então há rate limit: 10 falhas por IP → bloqueio de 15 min;
- sessão é **token opaco** no `expo-secure-store` (não JWT): revogar é um `UPDATE`.

Entrada de membro: administrador gera um código de 6 caracteres em **Ajustes → Convidar pessoa**;
a pessoa instala o app, escolhe “Tenho um código de convite”, define nome e PIN.

---

## Como o sync funciona

`POST /api/sync` faz push **e** pull num único round-trip.

- **Movimentações são append-only** → dois aparelhos nunca conflitam (a soma está certa por construção).
- **Entidades mutáveis** (`items`, `locations`, …) usam **LWW** por `updated_at`, com carimbo do
  servidor (`max(cliente, servidor+1)`) para que a comparação seja consistente.
- **Exclusão** vira tombstone (`deleted_at`), não `DELETE`.
- **Cursor é por tabela** — um cursor global pularia linhas quando uma tabela bate no limite de página.
- `rev = 0` marca “sujo no aparelho”; depois do push, o pull devolve o `rev` do servidor.

---

## Estado atual (F0 concluída)

| Item | Estado |
|---|---|
| Monorepo, `packages/core` com DDL + contratos + unidades/dinheiro | ✅ |
| API: auth por PIN, convite, membros, rate limit, sync | ✅ 39 asserções |
| App: login, criar casa, entrar com convite, biometria, tema claro/escuro | ✅ |
| App: locais em árvore, criar/apagar, badge de “não sincronizado” | ✅ |
| App: dashboard com contadores e status de sync | ✅ |
| Docker + healthcheck | ✅ |
| F1: catálogo de itens e bens (`assets`) | ⏳ |
| F2: scanner de código de barras/QR | ⏳ |
| F4: etiquetas QR + impressão | ⏳ |

### Checklist de aceite da F0 (manual, em dois celulares)

1. `npm run dev:server` no servidor; celular A cria a casa (F1 do app → “Criar a casa”).
2. Ajustes → **Convidar pessoa** → aparece um código de 6 caracteres.
3. Celular B → “Tenho um código de convite” → entra com nome e PIN diferente.
4. Celular A cria “Cozinha” em **Locais** → sincroniza.
5. Celular B abre **Locais** → “Cozinha” aparece.
6. Celular B renomeia ninguém ainda (rename chega na F1), mas cria “Despensa” → aparece no A.
7. Modo avião no B → criar local funciona e mostra “não sincronizado”; ao voltar a rede, sincroniza.

---

## Notas de decisão

- **Sem Drizzle.** O `packages/core` publica DDL em SQL puro + tipos TS explícitos. Manter um schema
  Drizzle além da DDL criaria duas fontes de verdade divergindo com o tempo.
- **Sessão opaca em vez de JWT.** Revogar um aparelho perdido é um `UPDATE`; e o app não precisa
  renovar token em background.
- **`tsx` é dependência de produção** do servidor: roda TypeScript direto, sem etapa de build no Docker.
- **iOS fora do escopo**: o build precisa de Mac e o alvo é APK Android.
