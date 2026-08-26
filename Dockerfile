FROM node:22
WORKDIR /app

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
