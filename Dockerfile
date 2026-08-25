FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app

# Only copy package files first (caches dependencies)
COPY pnpm-lock.yaml package.json ./

# Install dependencies (cached until package.json changes)
RUN pnpm install --frozen-lockfile

# Copy the rest of the app
COPY . .

# Generate Prisma client + build
ENV DATABASE_URL="postgresql://dummy:password@dummy:5432/dummy?schema=public"
RUN pnpm exec prisma generate
RUN pnpm run build

# Precompile the seed script to plain JS — avoids running ts-node (which loads
# the full TS compiler into memory) at container startup on low-RAM hosts
RUN npx tsc prisma/seed.ts \
  --outDir dist-seed \
  --module commonjs \
  --target es2021 \
  --esModuleInterop \
  --skipLibCheck \
  --resolveJsonModule

# Production runtime
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only what's needed
COPY --from=base /app/dist ./dist
COPY --from=base /app/dist-seed ./dist-seed
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/prisma.config.ts ./prisma.config.ts
COPY --from=base /app/node_modules ./node_modules

EXPOSE 4000

CMD ["sh", "-c", "./node_modules/.bin/prisma db push && node dist-seed/seed.js && npm run start:prod"]
