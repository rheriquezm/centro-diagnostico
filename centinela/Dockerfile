FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4310 \
    DATA_DIR=/app/data

COPY package.json ./
COPY src ./src
COPY public ./public
RUN mkdir -p /app/data

EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:4310/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "src/server.js"]
