### Build stage
FROM node:22-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm

COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile

COPY . .

# VITE_ vars are embedded at build time — browser calls go to localhost:8000
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm run build

### Runtime stage
FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
ENV PORT=3000

CMD ["node", ".output/server/index.mjs"]
