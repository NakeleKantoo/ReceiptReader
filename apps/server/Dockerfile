# servidor do Quanto — roda com Node 22 + tsx (sem etapa de build)
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# packages/core é dependência de apps/server (file:../../packages/core).
# npm não instala as dependências de um pacote `file:` (só cria o symlink), então
# as do core são instaladas aqui explicitamente — senão `zod` não resolve em runtime.
COPY packages/core ./packages/core
RUN cd packages/core && npm install --omit=dev --no-audit --no-fund

COPY apps/server/package.json ./apps/server/package.json
RUN cd apps/server && npm install --omit=dev --no-audit --no-fund

COPY apps/server/src ./apps/server/src
COPY apps/server/tsconfig.json ./apps/server/tsconfig.json

WORKDIR /app/apps/server

# o banco fica no volume; precisa existir e ser gravável pelo usuário sem privilégio
RUN mkdir -p /data && chown -R node:node /app /data

# não roda como root: os arquivos do volume ficam com o UID 1000 no host
USER node

EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3030)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "src/index.ts"]
