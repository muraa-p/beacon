FROM node:24-alpine AS build

WORKDIR /app
COPY package.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm install

COPY . .
RUN npm run build

# ---- production image ----
FROM node:24-alpine

ENV NODE_ENV=production DATA_DIR=/data
WORKDIR /app

COPY --from=build /app/package.json ./
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
RUN npm install --omit=dev && npm cache clean --force

# The named volume mounted at /data is created root-owned, but the container runs
# as the unprivileged "node" user. Without this, SQLite fails on first boot with
# "unable to open database file" (errcode 14). Creating the directory here also
# means a fresh named volume inherits the right ownership.
RUN mkdir -p /data && chown -R node:node /data

USER node
EXPOSE 8080
VOLUME ["/data"]

CMD ["node", "server/dist/index.js"]