# Quanto — Inventário de Patrimônio Doméstico

> App **React Native + Expo** (Android) para inventariar tudo que existe em casa: alimentos,
> ferramentas, eletrônicos, produtos de limpeza. Leitura de código de barras/QR, impressão de
> etiquetas QR, contas por membro da família e histórico por unidade física.
>
> **Status:** plano final (v3). v1 (web) e v2 (multi-plataforma) descartadas.
> **F0 ✅ · F1 ✅ · F2 ✅ · F3 ✅ · F4 ✅** (catálogo, bens, scanner, movimentações, etiquetas impressas). Próxima: F5 (lotes e validade).
> App e servidor negociam `PROTOCOL_VERSION` (hoje 2): versão diferente falha com mensagem clara.

---

## 1. Decisões travadas

| # | Decisão |
|---|---|
| Nome | **Quanto** — URL scheme `quanto://` |
| Plataforma | **React Native + Expo SDK 58 / RN 0.88 · Android only** |
| Entrega | **APK** (AAB/Play Store depois) |
| Dev | Expo Go |
| Repo | Mesmo repo, branch **`rewrite`** |
| Server | **192.168.1.4**, domínio + IP fixo, **`https://quanto.leonnaviegas.dev.br`** |
| Usuários | Família, **máx. 5 contas** |
| Entrada | **Código de convite** (admin gera) |
| Login | **Só um segredo**: PIN de 6 dígitos **ou** senha — o segredo identifica a conta |
| Alimentos | Lote + validade **no MVP** |
| Duráveis | **`item` (modelo) + `asset` (unidade física)**: local, status, histórico de uso, manutenção, garantia |
| Foto | Opcional em tudo, **encorajada** (nudge visual) |
| Valor | Registrado por bem → patrimônio total |
| OpenFoodFacts | Sim (auto-preenche alimento por código de barras) |
| Notificações locais | Sim, no MVP |
| Modo inventário/contagem | Sim, no MVP |
| Export p/ seguro (CSV/PDF) | **Depois** (fora do MVP) |
| Idioma / tema | pt-BR · claro + escuro (automático) |
| Migração do app antigo | **Nenhuma** — começa vazio |

---

## 2. Stack

### Mobile (Android)
| Lib | Uso |
|---|---|
| `expo` 58 + `expo-router` 58 | Rotas por arquivo, tabs + modals |
| `expo-camera` 58 | **`CameraView` com leitura nativa**: EAN-13/8, UPC-A/E, Code128/39/93, ITF, QR, DataMatrix, PDF417 |
| `expo-sqlite` 58 | Banco **local** = fonte da verdade (offline-first) |
| `expo-secure-store` 58 | Refresh token + segredo no Keystore |
| `expo-local-authentication` 58 | Desbloqueio por digital/face |
| `expo-print` 58 | Impressão via **Android Print** + PDF compartilhável |
| `expo-sharing` / `expo-file-system` 58 | Compartilhar PDF, fotos |
| `expo-image-picker` 58 | Foto do item/bem (`launchCameraAsync`) |
| `expo-haptics` + `expo-audio` 58 | Bipe/vibração no scan |
| `expo-notifications` 58 | Alertas **locais** (vencimento, estoque baixo, empréstimo atrasado) |
| `react-native-qrcode-svg` | QR na tela (preview / compartilhar) |
| `expo-updates` | *(futuro)* OTA patch sem reinstalar APK |

### Server (192.168.1.4)
| Item | Escolha |
|---|---|
| Runtime | Node 22 + Express 5 |
| Banco | `better-sqlite3` (WAL) — arquivo único, backup trivial |
| Persistência | **SQL puro + `packages/core`** com DDL compartilhado e tipos TS (Drizzle descartado: viraria 2ª fonte de verdade) |
| Validação | `zod` (compartilhado) |
| Senha | `node:crypto` **scrypt** (sem build nativo) |
| TLS | Reverse proxy já existente + Let's Encrypt no subdomínio |
| Deploy | `docker-compose.yml` |

  > **`packages/core`**: DDL em SQL puro (roda igual no `expo-sqlite` e no `better-sqlite3`) + Zod + `units.ts` + `money.ts`.
> Importado pelo app (`expo-sqlite`) e pelo server (`better-sqlite3`). Regra idêntica nos dois lados.

### Monorepo
```
quanto/
├── apps/
│   ├── mobile/              # Expo
│   │   ├── app/             # rotas (expo-router)
│   │   ├── src/{components,lib,hooks,theme}
│   │   ├── app.json         # scheme "quanto"
│   │   └── eas.json         # profile preview → APK
│   └── server/
│       ├── src/{routes,lib,migrations}
│       └── Dockerfile
├── packages/
│   └── core/
├── docker-compose.yml
└── README.md
```

---

## 3. Arquitetura

O celular **funciona 100% offline**. O servidor existe para a família compartilhar dados.

```
┌─────────────┐   expo-sqlite (fonte da verdade)    ┌──────────────────────────┐
│  App Expo   │ ────────── /api/sync (delta) ──────▶│ quanto.leonnaviegas.dev.br│
└─────────────┘◀────────────────────────────────────│ Express + SQLite (Docker) │
                                                     └──────────────────────────┘
                                                       volume: data/quanto.db
```

HTTPS público resolve de uma vez: acesso em casa e no 4G, sem truque de ATS/cleartext.

### Por que o sync é fácil
**`movements` é append-only e imutável.** Dois celulares registrando "usei 200 g de arroz" geram
duas linhas distintas — a soma está certa por construção. **Zero conflito.** Idem manutenção,
empréstimo e lista de compras.

Conflito só em entidades mutáveis (`items`, `assets`, `locations`, `categories`): **LWW** por
`updated_at` do servidor + tombstones (`deleted_at`) + `rev` monotônico como cursor de pull.

```
POST /api/sync
  { cursor, changes: { items, assets, locations, movements, lots, ... } }
← { cursor, changes: { ...linhas com rev > cursor... } }
```
- IDs: **UUIDv7 gerado no cliente** (`expo-crypto`) → nada de id negativo para reconciliar.
- `movements` nunca é atualizado nem apagado; desfazer = **inserir linha inversa** (`reverses_id`).

---

## 4. Modelo de dados

```
households(id, name, invite_code, created_at)
users (id, household_id, name, secret_hash, role, avatar_path, created_at)
      -- sem e-mail: o segredo identifica a conta. máx 5 por household.
refresh_tokens(id, user_id, device_name, token_hash, expires_at, revoked_at)

categories(id, household_id, name, parent_id, icon, color)
locations (id, household_id, name, parent_id, icon, notes)  -- Casa›Cozinha›Despensa›Prateleira 2

items (                                -- MODELO/produto
  id, household_id, public_id UNIQUE,  -- 6 chars → QR
  name, brand, category_id,
  kind,                                -- 'consumable' | 'durable'
  base_unit,                           -- 'g','ml','un','mm'
  min_qty,
  barcode, photo_path, notes,
  deleted_at, created_at, updated_at
)
item_barcodes(id, item_id, barcode UNIQUE, format)
item_aliases (id, item_id, alias)      -- sinônimos de busca
item_tags(item_id, tag_id)

assets (                               -- UNIDADE FÍSICA (duráveis)
  id, item_id, public_id UNIQUE,
  nickname, serial, location_id,
  status,        -- available | in_use | loaned | maintenance | lost | disposed
  holder_user_id,
  acquired_on, value_cents, warranty_until,
  photo_path, notes
)

lots (id, item_id, code, received_on, expires_on, location_id)   -- FEFO

movements (id, household_id, item_id, asset_id?, lot_id?, location_id,
           delta,          -- inteiro na unidade base
           type,           -- in|consume|checkout|checkin|adjust|transfer|discard|maintenance|revert
           user_id,        -- quem → histórico de uso
           note, created_at, reverses_id, rev)

maintenance(id, asset_id, kind, done_on, next_on, cost_cents, provider, notes, user_id)
loans(id, asset_id, borrower_user_id?, borrower_name, due_on, returned_at, note)
shopping_list(id, household_id, item_id, qty, done_at, note)
attachments(id, item_id?, asset_id?, kind, path, created_at)
product_cache(barcode UNIQUE, name, brand, image_url, fetched_at)  -- OpenFoodFacts
```

**Invariantes**
- Quantidade = **inteiro na unidade base** (`500 g`, nunca `0.5 kg`).
- Dinheiro = **centavos** (`INTEGER`).
- Saldo = derivado: `SUM(delta) FROM movements WHERE item_id = ?` — nunca editado à mão.
- `asset.status` é resumo recalculável por replay de `movements`.

**Histórico de uso de um bem** = timeline de `movements` do `asset_id` (com `user_id` e local)
+ entradas de `maintenance`.

---

## 5. Autenticação (PIN/senha sem e-mail)

```
Login: 1 campo só → "Digite seu PIN ou senha"
       POST /api/auth/login { secret, device_name }
       Server: para cada user do household, scrypt(secret) == secret_hash
               (≤5 contas → ≤5 comparações, ~200 ms no total)
       → access token (15 min) + refresh token (90 d, rotativo) no expo-secure-store
```

- **Unicidade**: ao criar/trocar o segredo, o server rejeita se já existe outro usuário com o mesmo
  PIN (`409`). Sem isso, "123456" seria ambíguo.
- **Força bruta**: 6 dígitos = 10⁶. Proteção obrigatória: rate-limit por IP e por dispositivo,
  backoff exponencial, bloqueio de 15 min após 10 falhas, log de tentativas.
- **Depois do 1º login**: o app abre com **biometria**; o segredo só é pedido de novo se o refresh
  expirar ou o usuário sair.
- **Entrada na família**: admin gera `invite_code` (6 chars, 24 h) → novo membro instala o APK,
  digita o código, define nome + PIN → conta criada no household.
- **Papéis**: `admin` (único que exclui membros e apaga itens/bens) e `member`.

---

## 6. Telas (expo-router)

```
Tabs
├── Início      Patrimônio total, nº de bens, estoque baixo, vencendo em 7 d,
│               emprestado, atividade recente
├── Estoque     Lista/busca, filtros (categoria, local, tipo, baixo estoque), agrupamento
├── [Escanear]  FAB central → câmera full-screen
├── Locais      Árvore; tocar → conteúdo, QR do local, "contar aqui"
└── Ajustes     Membros/convite, categorias, etiquetas, sync, backup, tema, sair

Modals
  item/[id]     Saldo, lotes/validade, histórico, QR, movimentar, editar
  asset/[id]    Status, quem está com, timeline de uso, manutenções, garantia
  item/new      Cadastro (pré-preenchido quando vem do scan)
  scan/[ctx]    Modo inventário com local fixado
  print         Seleção + preset de folha + preview + imprimir/PDF
  shopping      Lista de compras
  loans         Empréstimos ativos/atrasados
  household     Membros, convite, papéis
```

---

## 7. Fluxos-chave

### 7.1 Scan → ação (coração do app)
```
Câmera abre. Detecta EAN / QR.
  ├─ QR quanto://i/<publicId>   → item
  ├─ QR quanto://a/<publicId>   → bem
  ├─ QR quanto://l/<id>         → local (conteúdo / vira contexto)
  ├─ Código conhecido           → sheet: [ −1 ] [ +1 ] [ Detalhes ] [ Mover ]
  └─ Código desconhecido        → consulta OpenFoodFacts (cache local)
                                  → cadastro rápido (nome, categoria, local, mín, unidade, foto)
```
- Scan **contínuo**: bipe + vibração, ignora repetição do mesmo código por 1,5 s, contador grande.
- **Leitor HID** (pistola Bluetooth/USB): campo que aceita o "teclado" do scanner + Enter.
- Lanterna, zoom, entrada manual.

### 7.2 Modo inventário
QR do local → contexto fixado → bipe/bipe/bipe → **Finalizar contagem** → gera `adjust` para bater
com o contado. É o que torna o app usável numa estante cheia.

### 7.3 Etiquetas QR
```
/print → seleciona itens/locais/bens → preset → preview → Imprimir | Salvar PDF
```
Gera **HTML com QR em SVG inline** (`qrcode.toString({type:'svg'})`) + `@page { size: A4 }` +
CSS grid → `Print.printAsync({ html })` (Android Print) ou `printToFileAsync` + `Sharing` para
mandar no WhatsApp/Drive/gráfica.

- Presets: 40×30, 50×30, **Pimaco A4260 (63,5×38,1 — 21/folha)**, cartão 90×50, A4 cheio.
- Etiqueta = QR ≥ 18 mm + nome + código legível + categoria.
- Etiquetas de **item**, de **local** e de **bem** (bem = unidade física, com série).
- Impressora térmica (Niimbot/Brother QL) fica **fora do escopo** (lib nativa, não roda no Expo Go).

### 7.4 Alimentos
Lote com validade → saída consome **FEFO** → alertas "vence em 7 d"/"vencido" no dashboard +
notificação local. Botão "descartar" (`discard`).

### 7.5 Família
Toda ação grava `user_id`: "quem usou a furadeira", "quem consumiu o leite". Empréstimo entre
membros com prazo e aviso de atraso.

---

## 8. API

```
POST /api/auth/login { secret, device_name }   -> access + refresh
POST /api/auth/refresh   POST /api/auth/logout   GET /api/auth/me
POST /api/household/join { invite_code, name, secret }
GET  /api/household    GET /api/household/members
POST /api/household/invite
PATCH /api/household/members/:id   (admin: papel, reset de segredo)
DELETE /api/household/members/:id  (admin)

POST /api/sync     ← o endpoint que importa (delta bidirecional)
GET  /api/sync/status

GET  /api/items?q&category&location&low_stock&expiring
GET  /api/items/:id      (item + saldo + lotes + timeline)
POST /api/items/:id/photo
GET  /api/lookup/:barcode   → item local | OpenFoodFacts | null
GET  /api/dashboard
GET  /api/backup            (download do .db) + backup diário VACUUM INTO
```

Movimentos, bens, locais e listas trafegam pelo `/api/sync`. Superfície pequena = menos bug.

---

## 9. Fases

### F0 — Fundação (≈2 dias)
Monorepo (npm workspaces) + `packages/core` (schema Drizzle, zod, units, money, permisos).
Expo app com expo-router, tabs, tema claro/escuro, tela de login (PIN) + biometria.
Server Express + SQLite + auth scrypt + convite + rate-limit.
Migrações no app **e** no server. Sync mínimo (`categories` + `locations`).
- ✅ Dois celulares no Expo Go: admin cria família, gera convite, membro entra com PIN,
  local criado em um aparece no outro.

### F1 — Catálogo, Locais e Bens (≈3 dias)
CRUD de itens (foto via câmera, marca, categoria, tipo, unidade, mínimo), barcodes múltiplos,
aliases, busca normalizada (sem acento). Árvore de locais. **`assets`**: unidade com apelido, série,
valor, garantia, foto.
- ✅ Cadastrar "Arroz 5 kg" (consumível) e "Furadeira Bosch" com 2 unidades individuais distintas.

### F2 — Scanner (≈2,5 dias)
`expo-camera` contínuo, todos os formatos, debounce, haptics + bipe, lanterna, HID, entrada manual.
Código desconhecido → OpenFoodFacts (cache) → cadastro rápido. Leitura de QR `quanto://`.
**Modo inventário** com contexto de local.
- ✅ Ler EAN-13 real + QR gerado pelo app, ambos resolvem, offline, com contador.

### F3 — Movimentos & Histórico (≈2 dias)
`in / consume / checkout / checkin / adjust / transfer / discard`, saldo derivado, timeline por item
e por bem, desfazer por linha inversa, autorização em todas as rotas.
- ✅ 10 movimentos → saldo certo; desfazer restaura; timeline da furadeira mostra quem usou quando.

### F4 — Etiquetas & Impressão (≈2 dias)
Gerador HTML/SVG, presets de folha, preview, Android Print + PDF compartilhável, etiquetas de
item/local/bem.
- ✅ Imprimir folha A4260, cortar, ler todas as etiquetas com a câmera do app.

### F5 — Alimentos: lotes, validade, alertas (≈2 dias)
`lots` + FEFO + dashboard de vencimento + **notificações locais** agendadas. Lista de compras
automática (abaixo do mínimo) e "comprei" → entrada.
- ✅ Lote vencendo aparece no dashboard e notifica; consumir dá baixa no lote mais antigo.

### F6 — Empréstimos, manutenção, garantia (≈1,5 dia)
Empréstimo com prazo + cobrança de atraso, manutenção com `next_on`, alerta de garantia vencendo.
- ✅ Emprestar furadeira muda status, notifica atraso, devolver volta com histórico.

### F7 — Deploy & APK (≈2 dias)
Docker + reverse proxy no subdomínio, HTTPS validado. EAS build `preview` → **APK** instalado em
todos os celulares (keystore salvo). Backup/restore documentado. Sync endurecido (retry, fila,
conflito LWW testado). README.
- ✅ `https://quanto.leonnaviegas.dev.br` respondendo; APK instalado em 2 celulares sincronizando
  fora de casa no 4G; backup restaurado em máquina limpa.

**MVP (F0–F6) ≈ 15 dias · + deploy/APK ≈ 17 dias**

### Backlog pós-MVP
Export CSV/PDF para seguro · AAB + Play Store · OTA via `expo-updates` · impressora térmica ·
leitura de nota fiscal por foto (OCR) · relatório de consumo mensal.

---

## 10. Riscos

| Risco | Mitigação |
|---|---|
| **PIN de 6 dígitos = 10⁶** | Rate-limit + backoff + lockout 15 min + segredo único por família + biometria após 1º login |
| Login sem e-mail: **como saber de quem é o segredo** | Comparação contra ≤5 hashes (trivial nessa escala) + `409` se o PIN já existir |
| **NAT loopback**: usar o domínio público de dentro de casa pode falhar | Testar na F0; alternativa = DNS interno apontando pro 192.168.1.4, ou app usando a LAN quando disponível |
| **Expo Go só roda o SDK mais recente** | Fixar SDK 58; subir de SDK só de propósito |
| Perda de dados (SQLite no celular + server) | Backup diário `VACUUM INTO` no server + export/import manual no app |
| **APK assinado**: trocar keystore impede atualizar por cima | Salvar o keystore do EAS no repo privado/gerenciador de senhas |
| ~~Drizzle + expo-sqlite~~ | Resolvido: DDL em SQL puro, migrações por `PRAGMA user_version` nos dois lados |
| Push remoto não funciona no Expo Go | MVP usa notificação **local** (agendada no aparelho) |
| iOS build precisa de Mac | Fora do escopo — Android only |
| Scope creep | Fases com aceite fechado; F6 é o único candidato a sair do MVP se apertar |

---

## 11. Últimas 3 confirmações (não bloqueiam a F0)

1. **Reverse proxy** no 192.168.1.4 — já usa nginx, Caddy ou Traefik? (define o bloco de config do
   subdomínio; Caddy é o mais simples, 3 linhas com Let's Encrypt automático)
2. **Build do APK** — tem conta Expo (EAS) ou quer build local com `eas build --local` (precisa
   Android SDK + JDK 17 na máquina)? EAS cloud é o caminho mais curto.
3. **A lanterna/interruptor de scan** e o **bipe** podem usar som do sistema, ou quer um som próprio
   (arquivo curto)? Default: som do sistema + vibração.
