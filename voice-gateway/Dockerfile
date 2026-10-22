# Dibangun dari akar repo agar korpus knowledge/regulasi-bpom ikut masuk:
#   docker build -f voice-gateway/Dockerfile .
FROM node:24-slim
WORKDIR /app/voice-gateway
ENV NODE_ENV=production PORT=8090
COPY voice-gateway/package.json voice-gateway/percakapan.mjs voice-gateway/pengetahuan.mjs voice-gateway/server.mjs ./
COPY knowledge/regulasi-bpom /app/knowledge/regulasi-bpom
USER node
EXPOSE 8090
CMD ["node", "server.mjs"]
