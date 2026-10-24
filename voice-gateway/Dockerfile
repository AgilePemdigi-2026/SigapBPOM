FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8090
COPY package.json percakapan.mjs server.mjs ./
USER node
EXPOSE 8090
CMD ["node", "server.mjs"]
