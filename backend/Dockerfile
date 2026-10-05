# FlexiTrack backend: Node API + poll automation + reminders + socket.io.
# Run as ONE container only. The poll/reminder schedulers and socket.io
# both assume a single process (no PM2 cluster, no replicas).
FROM node:20-bookworm-slim

# openssl: Prisma's query engine needs it. tzdata: shift/poll logic uses
# server-local time and must run in IST (TZ is set in docker-compose.yml).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl tzdata \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first so code-only changes reuse this cached layer. Dev deps
# are kept on purpose: the `prisma` CLI (a devDependency) runs
# `migrate deploy` at every container start.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci && npm cache clean --force

COPY src ./src
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh \~
  && chown -R node:node /app

USER node
ENV NODE_ENV=production
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
