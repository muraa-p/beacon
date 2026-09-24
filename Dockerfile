FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm install

COPY . .
RUN npm run build

# ---- production image ----
FROM node:24-alpine

ENV NODE_ENV=production DATA_DIR=/data
WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
RUN npm install --omit=dev && npm cache clean --force

USER node
EXPOSE 8080
VOLUME ["/data"]

CMD ["node", "server/dist/index.js"]