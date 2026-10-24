# Dibangun dari akar repo agar seluruh korpus knowledge/ ikut masuk:
#   docker build -f voice-gateway/Dockerfile .
FROM node:24-slim
WORKDIR /app/voice-gateway
ENV NODE_ENV=production PORT=8090 KORPUS_DIR=/app/knowledge
COPY voice-gateway/package.json voice-gateway/eskalasi.mjs voice-gateway/percakapan.mjs voice-gateway/pengetahuan.mjs voice-gateway/server.mjs ./
COPY knowledge /app/knowledge
USER node
EXPOSE 8090
CMD ["node", "server.mjs"]
