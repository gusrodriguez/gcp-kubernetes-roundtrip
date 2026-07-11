# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# Copy workspace root files for npm workspace resolution
COPY package.json package-lock.json ./
COPY proto/package.json proto/
COPY orders-service/package.json orders-service/

RUN npm ci --workspace=@gcp-k8s-roundtrip/proto --workspace=@gcp-k8s-roundtrip/orders-service

# Copy source
COPY tsconfig.base.json ./
COPY proto/ proto/
COPY orders-service/ orders-service/

# Build proto first (dependency), then orders-service
RUN npm run build --workspace=@gcp-k8s-roundtrip/proto && \
    npm run build --workspace=@gcp-k8s-roundtrip/orders-service

# --- Runtime stage ---
FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app

# Copy workspace root for resolution
COPY package.json package-lock.json ./
COPY proto/package.json proto/
COPY orders-service/package.json orders-service/

RUN npm ci --workspace=@gcp-k8s-roundtrip/proto --workspace=@gcp-k8s-roundtrip/orders-service --omit=dev

# Copy built output and proto file
COPY --from=build /app/proto/dist proto/dist/
COPY --from=build /app/proto/order.proto proto/
COPY --from=build /app/orders-service/dist orders-service/dist/

USER appuser
EXPOSE 50051 9090

CMD ["node", "orders-service/dist/index.js"]
