# Build stage
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# NEXT_PUBLIC_* values must exist at build time for Next.js client bundles.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SIGNALING_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SIGNALING_URL=$NEXT_PUBLIC_SIGNALING_URL

# Install dependencies
COPY package*.json ./
RUN npm ci

# Build the Next.js app
COPY . .
RUN npm run build

# Production stage
FROM node:22-bookworm-slim

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built app from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy server code (for signaling, scripts, etc.)
COPY --from=builder /app/server ./server
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/db ./db

# Create a non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g 1001 -m nextjs

USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 3000

# Start the application
CMD ["npm", "start"]
