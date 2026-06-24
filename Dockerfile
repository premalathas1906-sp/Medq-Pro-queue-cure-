# Stage 1: Build the frontend client assets
FROM node:18-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Assemble Node server and serve client dist folder
FROM node:18-alpine
WORKDIR /app

# Install server packages
COPY server/package*.json ./server/
RUN npm install --prefix server --omit=dev

# Copy server code
COPY server/ ./server/

# Copy compiled frontend from client-builder
COPY --from=client-builder /app/client/dist ./client/dist

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "server/server.js"]
