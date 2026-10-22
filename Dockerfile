FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && mkdir -p /app/data && chown node:node /app/data
COPY --chown=node:node . .
USER node
ENV HOST=0.0.0.0 PORT=4173 NODE_ENV=production DATABASE_PATH=/app/data/passport.sqlite
EXPOSE 4173
CMD ["node", "server.mjs"]
