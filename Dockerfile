FROM node:22
WORKDIR /app

# Get the latest git commit hash as an env variable
# and then we'll inject it build time
ARG PUBLIC_GIT_COMMIT=unknown
ENV PUBLIC_GIT_COMMIT=$PUBLIC_GIT_COMMIT

COPY . .

RUN npm install
RUN npm run build

EXPOSE 5999/tcp

ENV HOST=0.0.0.0
ENV PORT=5999
ENV BODY_SIZE_LIMIT=8000000

# Was: node build/index.js (adapter-node's default entry, no WebSocket support)
# Now: run our own server.ts entry via tsx, which wraps the same
# build/handler.js AND attaches a ws.WebSocketServer on the same HTTP port.
CMD ["npm", "start"]
