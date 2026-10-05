# FlexiTrack HR web console.
# Stage 1 builds the React app into static files; stage 2 serves them with
# Nginx, which also forwards /api and /socket.io to the backend container.

FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Same-origin API: the browser calls /api on whatever address served this
# page, and Nginx below forwards it to the backend. The socket.io URL is
# derived from this too (src/api/client.js), so live updates follow along.
ARG API_URL=/api
ENV API_URL=${API_URL}
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
