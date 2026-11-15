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

### 1. Antes de tudo: DNS e portas

- registro **A** de `quanto.leonnaviegas.dev.br` apontando para o IP fixo;
- portas **80 e 443** encaminhadas no roteador para o servidor (a 80 é do desafio do
  Let's Encrypt, não só redirect).

Sem isso o resto não fecha — e é o primeiro lugar onde o `check:deploy` acusa problema.

### 2. Banco e container

```bash
mkdir -p data && sudo chown -R 1000:1000 data   # o container roda sem root
cp deploy/.env.example .env                     # ajuste PUBLIC_URL e QUANTO_BIND

docker compose up -d --build
docker compose ps                               # precisa dizer (healthy)
```

O container escuta em `127.0.0.1:3030` por padrão: só o reverse proxy alcança. Para testar
direto da rede local, `QUANTO_BIND=0.0.0.0 docker compose up -d`.

### 3. Reverse proxy

Escolha **um**; os arquivos estão prontos em `deploy/`.

| Proxy | Arquivo | Instalação |
|---|---|---|
| **Caddy** (recomendado) | `deploy/Caddyfile` | `sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy` |
| nginx | `deploy/nginx-quanto.conf` | copiar para `sites-available`, linkar, `certbot --nginx -d …` |
| Traefik | `deploy/traefik-quanto.yml` | jogar em `/etc/traefik/dynamic/` |

O Caddy resolve o certificado sozinho em segundos. Os três já mandam
`Strict-Transport-Security`, `X-Content-Type-Options` e `Referrer-Policy`.

### 4. Conferir de fora

```bash
npm run check:deploy -- https://quanto.leonnaviegas.dev.br
```

Verifica conexão TLS, se o certificado é confiável e quanto tempo falta, `/api/health`,
`/api/public/status`, o protocolo de sync e se `/api/sync` recusa requisição sem token.

### 5. Backup

```bash
npm run backup                 # ./data/backups/quanto-AAAAMMDD-HHMMSS.db
npm run backup -- --keep 30    # retenção
```

Usa `VACUUM INTO` (cópia consistente mesmo com o servidor escrevendo), **valida** abrindo o
backup e contando casas/itens/movimentações, e apaga os antigos.

Cron diário às 3h:

```cron
0 3 * * * cd /caminho/ReceiptReader && /usr/bin/node apps/server/scripts/backup.mjs --keep 30 >> /var/log/quanto-backup.log 2>&1
```

**Restaurar:**

```bash
docker compose stop
cp data/backups/quanto-20261115-030000.db data/quanto.db
rm -f data/quanto.db-wal data/quanto.db-shm
docker compose start
```

Se os celulares já tinham dados e o servidor voltou vazio, use
**Ajustes → Sincronização → Reenviar tudo deste aparelho**.

### Variáveis do servidor

| Variável | Default | Para que serve |
|---|---|---|
| `PORT` | `3030` | porta dentro do container |
| `HOST` | `0.0.0.0` | interface |
| `DATABASE_PATH` | `./data/quanto.db` | arquivo SQLite |
| `PUBLIC_URL` | — | domínio público (mostrado nas mensagens) |
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

---

## App: gerando o APK

```bash
cd apps/mobile
npx eas login
npx eas build --profile preview --platform android
```

O perfil `preview` já está configurado para **APK** (não AAB) e aponta para
`https://quanto.leonnaviegas.dev.br`. No fim, o EAS dá um link — abra no celular e autorize a
instalação de fonte desconhecida.

Build **local** (sem fila do EAS, precisa de Android SDK + JDK 17 na máquina):

```bash
npx eas build --profile preview --platform android --local
```

> **Guarde o keystore.** `npx eas credentials` mostra/baixa. Se você trocar de keystore, o Android
> recusa instalar a atualização por cima do APK antigo — só desinstalando (e perdendo o banco local).

### Primeira execução em cada aparelho

```
1. instalar o APK
2. "Servidor da casa" → https://quanto.leonnaviegas.dev.br → Conectar
3. primeiro aparelho: Criar a casa
4. Ajustes → Convidar pessoa → código de 6 caracteres
5. demais aparelhos: mesmo endereço → "Tenho um código de convite"
```

---

## Sincronização (como ela se protege)

- **Retry com backoff** (1s, 3s, 7s) só para falha de rede e 5xx — 4xx e divergência de contrato
  nunca melhoram sozinhas, então não repetem.
- **Sincroniza ao voltar para o app** (`AppState`), no máximo uma vez por minuto.
- **Chamadas concorrentes compartilham a mesma promessa**: duas telas com `useSync` não empurram a
  mesma fila duas vezes.
- **Protocolo negociado**: app e servidor de versões diferentes falham com mensagem clara em vez de
  erro de validação.
- **Offline é estado normal**: as alterações ficam com `rev = 0` e sobem no próximo sync.

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
| API: auth por PIN, convite, membros, rate limit, sync | ✅ 66 asserções |
| Tela inicial de servidor (self-hosted), com teste de conexão | ✅ |
| App: criar casa, entrar com convite, biometria, tema claro/escuro | ✅ |
| App: locais em árvore, criar/apagar offline, badge de “não sincronizado” | ✅ |
| App: dashboard com contadores e status de sync | ✅ |
| Docker não-root + healthcheck | ✅ |
| **F1:** catálogo de itens, categorias, bens, códigos de barras e apelidos | ✅ |
| **F2:** scanner de código de barras/QR, etiqueta QR na tela e consulta de produto | ✅ |
| **F3:** movimentações, saldo derivado, histórico por item/bem e desfazer | ✅ |
| **F4:** folhas de etiqueta QR (A4), prévia e PDF compartilhável | ✅ |
| **F5:** lotes com validade, FEFO, alertas de vencimento e lista de compras | ✅ |
| **F6:** empréstimo com prazo, manutenção e garantia; retirar/devolver em um toque | ✅ |
| **F7:** Docker + reverse proxy prontos, backup validado, APK e endurecimento do sync | ✅ |

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

### F2 — scanner

- **Escanear** (aba central): camera contínua lendo EAN-13/8, UPC-A/E, Code128/39/93, ITF-14,
  Codabar, QR, DataMatrix, PDF417 e Aztec. Lanterna, entrada manual e leitor USB/Bluetooth (HID)
  pelo campo de texto. Bipe + vibração, e o mesmo código é ignorado por 1,5 s.
- Código de etiqueta do app (`quanto://i|a|l/...`) abre item, bem ou local.
- Código de barras conhecido abre o item. Desconhecido consulta o **OpenFoodFacts** (com cache
  local de 30 dias) e oferece cadastrar já preenchido ou **vincular a um item existente**.
- **Etiqueta QR na tela**: item, local (e bem) têm a etiqueta com o mesmo payload que a F4 vai
  imprimir — dá para testar a leitura com dois aparelhos ou uma foto do QR.
- A câmera é desmontada ao sair da aba (privacidade e bateria).

Contagem por local e movimentação de estoque continuam fora: entram na **F3**, porque hoje não há
para onde gravar a quantidade.

### F3 — saldo e histórico

- **Saldo derivado**: consumível é `SUM(delta)` das movimentações; durável é a contagem de bens
  (cada unidade é uma linha em `assets`). Nada de coluna `qty` editável.
- **Ações** no item: entrada, consumo, ajuste (você conta, o app calcula a diferença), descarte e
  transferência (par de movimentos com o mesmo instante: o total não muda, o local sim).
- **Quantidade amigável**: digite em kg/L/m e o app converte para a unidade base (g/ml/mm).
- **Histórico** com autor, local, data e observação; **desfazer** insere a linha inversa
  (`reverses_id`) — o ledger continua append-only e auditável.
- **Bens**: retirar/devolver grava quem levou, muda `status` e `holder_user_id`; a timeline do bem é
  o histórico de uso.
- **Dashboard** mostra "para comprar" (itens abaixo do mínimo) e o **Estoque** mostra o saldo de
  cada item com selo de compra.

Regra de ouro: o servidor nunca aceita `user_id` de quem não é da casa — o autor do movimento é
validado contra `members` e, se inválido, vira quem sincronizou.

### F4 — etiquetas e impressão

- **Imprimir etiquetas** (ou pela home) → escolhe Itens, Bens ou Locais, seleciona o que vai
  imprimir, escolhe o tamanho da folha e vê a **prévia** antes.
- Presets: **Pimaco A4260 (63,5 × 38,1 — 21/folha)**, pequena 40 × 30, média 50 × 30,
  cartão 90 × 50 e A4 cheio. O app avisa se o preset não cabe na folha.
- **Imprimir** abre o diálogo do Android (dá para mandar para PDF); **Compartilhar PDF** gera o
  arquivo e oferece WhatsApp/Drive/gráfica.
- QR é **vetorial** (SVG inline, tamanho em mm) — imprime nítido em qualquer tamanho, e cada
  etiqueta leva nome, subtítulo (categoria/marca/série) e o código legível.
- Múltiplas folhas: 25 etiquetas na A4260 viram 2 folhas (21 + 4), com quebra de página correta.
- A prévia usa **o mesmo HTML** que vai para a impressora (WebView), não um desenho parecido.

### F5 — validade e lista de compras

- **Entrada com validade**: no formulário de entrada, informe a data e o app cria um **lote**. O
  saldo do lote é a soma dos movimentos ligados a ele — nada de contador paralelo.
- **FEFO**: consumo e descarte saem primeiro do lote que vence antes, e podem virar **várias
  linhas** se a quantidade atravessar lotes. O total do item continua intacto.
- **Alertas**: a home mostra uma faixa "Validade" com lotes vencidos e vencendo em 7 dias; na tela
  do item, o lote vencido ganha um botão **descartar** que baixa o que restou.
- **Lista de compras**: sugestões automáticas dos itens abaixo do mínimo (com quanto falta),
  adição manual, e **"comprei"** dá entrada no estoque e fecha a linha.
- **Home**: quatro ações (Escanear, Usar item, Dar entrada, Lista de compras) + atalhos para
  etiquetas e novo item, e o card de validade.
- **Comprar pelo scanner**: ao ler o código de um consumível, o app abre direto o formulário de
  compra — quantidade, validade e **quanto você pagou**. O preço fica no movimento (migração 4),
  então o custo tem histórico; o item mostra o último preço pago.
- **Lista de compras**: marcar com o check é só estético — a linha **continua na lista**, riscada,
  na mesma posição. Quem dá entrada no estoque é o botão "comprei".

Lógica de datas (`daysUntil`, `expiryTone`, `expiryLabel`) fica em `@quanto/core` e é testada:
vencido, vence hoje, vence em N dias, futuro e sem validade. O FEFO foi verificado com dois lotes
(vence antes zerado primeiro, total preservado).

### F6 — ferramentas: empréstimo, manutenção, garantia

- **Retirar / devolver** (ação na home): uma tela só, duas seções — "Fora / em uso" (com quem e até
  quando) e "Disponíveis". Um toque resolve; sem formulário.
- **Emprestar para fora**: na tela do bem, escolha a pessoa da casa (ou digite um nome de fora) e a
  data de devolução. O empréstimo vira `checkout` no histórico, muda `status` para `loaned` e grava
  para quem foi. "Devolvido" fecha o empréstimo e devolve o bem.
- **Manutenção**: registro com o que foi feito, data, custo, quem fez e a **próxima data**. Cada
  registro entra no histórico do bem como um evento.
- **Garantia**: data na tela do bem, com selo quando está vencendo (≤ 30 dias).
- **Prazos na home**: empréstimo atrasado em vermelho, devolução nos próximos 7 dias em amarelo,
  garantia e manutenção vencendo — cada linha abre o bem.

`loans` e `maintenance` já existiam no schema desde a F0; a F6 não precisou de migração.

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
