# Quanto

Inventário de patrimônio doméstico: o que a sua casa tem, onde está, com quem está e por quanto.

**Self-hosted**: o app Android (React Native + Expo) aponta para **o seu** servidor (Node + SQLite).
Sem nuvem de terceiros, sem telemetria, sem conta em SaaS — um servidor, uma família (até 5 pessoas).

> Plano completo por fases em [`PLANO.md`](./PLANO.md). Este README cobre o que **já funciona (F0)**.

---

## Começar em 30 segundos

```bash
npm install            # app + core
npm run server:install # dependências do servidor (uma vez)
npm run dev            # sobe API + Expo juntos
```

`npm run dev` detecta o IP da máquina na LAN (aqui: `192.168.1.5`), sobe a API na porta `3030`
com `HOST=0.0.0.0` e abre o Expo já apontando o app para esse endereço:

```
  API      http://192.168.1.5:3030
  App      Expo Go → escaneie o QR
  Endereço http://192.168.1.5:3030   (digite isso na primeira tela do app)
```

Para forçar outro endereço:

```bash
API_HOST=192.168.1.5 npm run dev
API_URL=http://10.0.0.9:3030 npm run dev
```

Celular e computador precisam estar na **mesma rede Wi-Fi**.

---

## Primeira execução: escolher servidor → criar casa

O app abre na tela **Servidor da casa**. É de propósito: o Quanto é self-hosted, então o endereço
vem antes de qualquer login. Ele testa a conexão antes de salvar.

```
1. Abrir o app
2. Endereço do servidor  →  http://192.168.1.5:3030  →  Conectar
3. Servidor respondeu "nenhuma casa criada"
4. Criar a casa:
     nome da casa   →  "Casa da Vila"
     seu nome       →  "Ana"
     PIN            →  6 dígitos (ou senha de 8+)
5. Pronto: você é o administrador
6. Ajustes → Convidar pessoa → código de 6 caracteres
7. Cada pessoa instala o app, aponta para o MESMO endereço,
   escolhe "Tenho um código de convite" e define um PIN diferente
```

O PIN é o identificador da conta (não existe e-mail): o servidor compara o segredo contra todas as
contas da casa, então **o PIN precisa ser único**. Depois do primeiro login o app abre por biometria.

Só pode existir **uma casa por servidor** — é um servidor da casa, não um SaaS.

<details>
<summary>Criando a casa direto pela API (sem o app)</summary>

```bash
curl -X POST http://192.168.1.5:3030/api/household \
  -H 'content-type: application/json' \
  -d '{"householdName":"Casa da Vila","name":"Ana","secret":"123456"}'
```
</details>

---

## Estrutura

```
apps/
  mobile/    app Expo (expo-router, expo-sqlite, expo-secure-store)
  server/    API Express + better-sqlite3
packages/
  core/      DDL compartilhado, tipos das linhas, contratos zod, unidades e dinheiro
scripts/
  dev.mjs    sobe API + Expo com o IP da LAN
```

`packages/core` é a fonte única: a **mesma** DDL roda no SQLite do aparelho e no do servidor.
Quantidade é sempre inteiro na unidade base (`500 g`) e dinheiro é sempre centavos.

---

## Servidor em produção

```bash
docker compose up -d --build
docker compose logs -f quanto
```

Roda como usuário **não-root** (`UID 1000`), então o banco em `./data/quanto.db` fica com o dono do
host. Se o seu UID não for 1000:

```bash
mkdir -p data && sudo chown -R 1000:1000 data
```

Backup:

```bash
docker compose exec quanto node -e "require('better-sqlite3')('/data/quanto.db').exec(\"VACUUM INTO '/data/backup-' + Date.now() + '.db'\")"
```

### HTTPS (para usar fora de casa)

Com **Caddy**, três linhas (certificado automático):

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

Aí, na tela de servidor do app, use `https://quanto.leonnaviegas.dev.br`.

### Variáveis do servidor

| Variável | Default | Para que serve |
|---|---|---|
| `PORT` | `3030` | porta |
| `HOST` | `0.0.0.0` | interface (precisa ser 0.0.0.0 para o celular alcançar) |
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

53 asserções: bootstrap, convite, login por PIN, unicidade do PIN, sync entre dois membros, LWW,
tombstones, append-only das movimentações, FK inválida recusada com motivo, protocolo incompatível,
isolamento por casa, troca de PIN, logout e rate limit.

---

## App

```bash
npm run dev            # recomendado (API + Expo, com o IP certo)
cd apps/mobile && npx expo start   # só o app
```

APK:

```bash
cd apps/mobile
npx eas build --profile preview --platform android
```

`eas.json` define `preview` → APK e `production` → AAB. **Guarde o keystore do EAS**: trocar de
keystore impede instalar a atualização por cima do APK antigo.

O `app.json` liga `usesCleartextTraffic`, então `http://` na LAN funciona também no APK — sem isso o
Android 9+ bloqueia e a falha parece “servidor fora do ar”.

---

## Como o login funciona

Não existe e-mail. Cada pessoa tem **um segredo só** — PIN de 6 dígitos ou senha de 8+ caracteres —
e é ele que identifica a conta:

- o servidor compara o segredo contra os hashes de **todas** as contas da casa (≤5), em tempo uniforme;
- para isso não gerar ambiguidade, o PIN precisa ser **único na casa** (o servidor responde `409`);
- depois do primeiro login o app abre com **biometria** (Keystore/Keychain);
- 6 dígitos são 10⁶ combinações, então há rate limit: 10 falhas por IP → bloqueio de 15 min;
- sessão é **token opaco** no `expo-secure-store` (não JWT): revogar é um `UPDATE`.

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

## Estado atual

| Item | Estado |
|---|---|
| Monorepo, `packages/core` com DDL + contratos + unidades/dinheiro | ✅ |
| API: auth por PIN, convite, membros, rate limit, sync | ✅ 39 asserções |
| Tela inicial de servidor (self-hosted), com teste de conexão | ✅ |
| App: criar casa, entrar com convite, biometria, tema claro/escuro | ✅ |
| App: locais em árvore, criar/apagar offline, badge de “não sincronizado” | ✅ |
| App: dashboard com contadores e status de sync | ✅ |
| Docker não-root + healthcheck | ✅ |
| **F1:** catálogo de itens, categorias, bens, códigos de barras e apelidos | ✅ |
| F2: scanner de código de barras/QR | ⏳ |
| F4: etiquetas QR + impressão | ⏳ |

### F1 — catálogo

O que já dá para fazer no app:

- **Estoque** → busca por nome/marca/categoria (sem acento), filtro consumível/durável, FAB **+**.
- **Item**: nome, marca, tipo, unidade de controle (`un`/`g`/`ml`/`mm`), categoria, local padrão,
  estoque mínimo e observações. Categoria nova pode ser criada direto do formulário.
- **Bem**: cada unidade de um item durável tem apelido, série, situação, local, data de compra,
  valor e garantia. O dashboard soma o **valor do patrimônio**.
- **Códigos de barras** e **nomes alternativos** por item (a busca também acha pelo apelido).
- **Locais**: renomear e apagar (além de criar).

Fora da F1 (próximas fases): quantidade em estoque e histórico (F3), scanner (F2), fotos
(backlog), etiquetas QR (F4).

### Checklist de aceite da F0 (manual)

1. `npm run dev` numa máquina; anote o endereço exibido.
2. Celular A: abre o app → digita o endereço → Conectar → **Criar a casa**.
3. Ajustes → **Convidar pessoa** → aparece um código de 6 caracteres.
4. Celular B: aponta para o **mesmo** endereço → “Tenho um código de convite” → nome + PIN diferente.
5. Celular A cria “Cozinha” em **Locais** → sincroniza.
6. Celular B abre **Locais** → “Cozinha” aparece.
7. Celular B cria “Despensa” offline (modo avião) → mostra “não sincronizado”; volta a rede → sincroniza e aparece no A.

---

## Problemas comuns

**"Servidor desatualizado: reinicie o servidor"**
O app e o servidor têm contratos diferentes de sync (o app manda `protocol` e o servidor confere).
Reinicie o servidor: `npm run dev` já observa `packages/core` e reinicia sozinho, mas um processo
antigo continua rodando até você matá-lo (`fuser -k 3030/tcp`).

**Tela volta sozinha para o início**
Era bug de redirect: qualquer rota fora das abas era considerada inválida. Corrigido — hoje só
telas de entrada (`login`, `setup`, `join`, `server`) expulsam o usuário autenticado.

**Não consigo criar um item**
Verifique se apareceu "Servidor desatualizado" na tela de Ajustes/Sincronização. O item é gravado
no aparelho mesmo sem servidor; ele sobe no próximo sync bem-sucedido.

## Notas de decisão

- **Servidor é a primeira tela.** App self-hosted não pode ter URL fixa no bundle; o endereço precisa
  ser escolhido (e trocável) em runtime.
- **Sem Drizzle.** `packages/core` publica DDL em SQL puro + tipos TS explícitos. Manter um schema
  Drizzle além da DDL criaria duas fontes de verdade divergindo com o tempo.
- **Sessão opaca em vez de JWT.** Revogar um aparelho perdido é um `UPDATE`; e o app não precisa
  renovar token em background.
- **`tsx` é dependência de produção** do servidor: roda TypeScript direto, sem etapa de build no Docker.
- **iOS fora do escopo**: build precisa de Mac e o alvo é APK Android.
