# Deploy — o contrato, não o seu stack

O Quanto **não assume** qual reverse proxy você usa. Este diretório descreve o que o proxy
precisa fazer; a configuração é sua.

O que já vem pronto do lado do app:

- o container publica **apenas em `127.0.0.1:3030`** (`QUANTO_BIND`), então o proxy é quem expõe;
- o app fala **só HTTPS** em produção e valida o certificado do sistema;
- `TRUST_PROXY` interpreta `X-Forwarded-For` na sintaxe do Express (ver abaixo).

---

## O contrato (vale para qualquer proxy)

| # | Requisito | Por quê |
|---|---|---|
| 1 | Encaminhar para `127.0.0.1:3030` (HTTP) | o container escuta em HTTP na loopback |
| 2 | Preservar `Host` | o app monta URLs e links a partir do que você acessa |
| 3 | Enviar `X-Forwarded-For` e `X-Forwarded-Proto` | rate limit por IP e detecção de HTTPS |
| 4 | **Não remover `Authorization`** | a sessão viaja em `Bearer` |
| 5 | Aceitar corpo de **até 4 MB** | push de sync manda até 200 linhas por tabela |
| 6 | Timeout ≥ **60 s** em `/api/sync` | primeira sincronização baixa o banco inteiro |
| 7 | Nada de WebSocket, SSE ou compressão obrigatória | a API é JSON puro, request/response |

Se o TLS terminar em outro lugar (CDN, balanceador), só garanta os itens 2 e 3.

## `TRUST_PROXY` — combinando com o seu cenário

```bash
# proxy na mesma máquina (o caso mais comum) — 1 salto
TRUST_PROXY=1

# CDN/Cloudflare na frente do proxy — 2 saltos
TRUST_PROXY=2

# só confia nas suas subredes (mais preciso)
TRUST_PROXY=127.0.0.1,10.0.0.0/8

# servidor exposto direto, sem proxy
TRUST_PROXY=false
```

Valor errado aqui não quebra nada visível: o rate limit passa a enxergar todos os clientes como o
mesmo IP (ou a confiar num IP forjado). O `check:deploy` avisa se o servidor não estiver atrás de
proxy quando você disser que está.

## Conferir depois de configurar

```bash
npm run check:deploy -- https://seu.dominio
```

Verifica TLS e validade do certificado, `/api/health`, `/api/public/status`, o protocolo de sync e
se `/api/sync` recusa requisição sem token.

Para testar o proxy sem o app: `curl -i https://seu.dominio/api/health` deve voltar `200` com
`{"ok":true,...}`.

---

## Apêndice — exemplos (adapte, não copie às cegas)

### Apache httpd 2.4 (mod_proxy + mod_ssl)

```apache
<VirtualHost *:80>
    ServerName quanto.leonnaviegas.dev.br
    # deixe o certbot cuidar do desafio e redirecione o resto
    RewriteEngine On
    RewriteRule ^/(?!\.well-known/acme-challenge/) https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
    ProxyPass /.well-known/acme-challenge/ !
</VirtualHost>

<VirtualHost *:443>
    ServerName quanto.leonnaviegas.dev.br

    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/quanto.leonnaviegas.dev.br/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/quanto.leonnaviegas.dev.br/privkey.pem

    # requisitos 5 e 6
    LimitRequestBody 4194304
    ProxyTimeout 60
    ProxyPreserveHost On

    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "443"

    ProxyPass        / http://127.0.0.1:3030/ retry=0
    ProxyPassReverse / http://127.0.0.1:3030/

    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "no-referrer"
</VirtualHost>
```

Módulos necessários: `proxy`, `proxy_http`, `headers`, `ssl`, `rewrite`.
`X-Forwarded-For` é montado pelo `mod_proxy` automaticamente.

### nginx

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name quanto.leonnaviegas.dev.br;

    ssl_certificate     /etc/letsencrypt/live/quanto.leonnaviegas.dev.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/quanto.leonnaviegas.dev.br/privkey.pem;

    client_max_body_size 4m;          # requisito 5

    location / {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;       # requisito 6
    }
}
```

### Caddy

```caddyfile
quanto.leonnaviegas.dev.br {
    reverse_proxy 127.0.0.1:3030
}
```

O Caddy já cumpre os sete requisitos por padrão e resolve o certificado sozinho.

### Traefik

Use um router HTTP para o domínio com `tls.certResolver` e o service apontando para
`http://127.0.0.1:3030` (ou a rede do container). Ajuste `clientMaxBodySize`/timeouts se você não
usa os padrões.
