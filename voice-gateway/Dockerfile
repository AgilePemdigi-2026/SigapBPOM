# Dibangun dari akar repo agar seluruh korpus knowledge/ ikut masuk:
#   docker build -f voice-gateway/Dockerfile .
FROM node:24-slim
WORKDIR /app/voice-gateway
# PENGETAHUAN_VEKTOR=1 menyalakan pencarian vektor cari-pengetahuan (butuh SUPABASE_URL dan SIGAP_KUNCI_INTERNAL).
ENV NODE_ENV=production PORT=8090 KORPUS_DIR=/app/knowledge PENGETAHUAN_VEKTOR=0
COPY voice-gateway/package.json voice-gateway/alatCekRegistrasi.mjs voice-gateway/alatPengetahuan.mjs voice-gateway/cekbpom.mjs voice-gateway/eskalasi.mjs voice-gateway/layananPengaduan.mjs voice-gateway/pengaduan.mjs voice-gateway/percakapan.mjs voice-gateway/panggilanAktif.mjs voice-gateway/pengetahuan.mjs voice-gateway/server.mjs voice-gateway/transkrip.mjs ./
COPY knowledge /app/knowledge
USER node
EXPOSE 8090
CMD ["node", "server.mjs"]
