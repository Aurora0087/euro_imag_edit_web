### Build stage
FROM node:22-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9

COPY package.json pnpm-lock.yaml ./

# Do NOT use --frozen-lockfile: the lockfile was generated on macOS and
# lacks @rolldown/binding-linux-x64-gnu (platform-specific native binding).
# pnpm install resolves the correct binary for the build platform.
RUN pnpm install

COPY . .

ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm run build

### Runtime stage
FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
ENV PORT=3000

CMD ["node", "dist/server/server.js"]
