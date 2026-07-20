# --- Build stage ---
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app

# Copy workspace root files for yarn workspace resolution
COPY package.json yarn.lock .yarnrc.yml ./
COPY proto/package.json proto/
COPY orders-service/package.json orders-service/
COPY gateway/package.json gateway/
COPY processing-service/package.json processing-service/

RUN yarn install --immutable

# Copy source
COPY tsconfig.base.json ./
COPY proto/ proto/
COPY orders-service/ orders-service/

# Build proto first (dependency), then orders-service
RUN yarn workspace @gcp-k8s-roundtrip/proto build && \
    yarn workspace @gcp-k8s-roundtrip/orders-service build

# --- Runtime stage ---
FROM node:20-alpine AS runtime
RUN corepack enable
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app

# Copy workspace root for resolution
COPY package.json yarn.lock .yarnrc.yml ./
COPY proto/package.json proto/
COPY orders-service/package.json orders-service/
COPY gateway/package.json gateway/
COPY processing-service/package.json processing-service/

RUN yarn workspaces focus @gcp-k8s-roundtrip/proto @gcp-k8s-roundtrip/orders-service --production

# Copy built output and proto file
COPY --from=build /app/proto/dist proto/dist/
COPY --from=build /app/proto/order.proto proto/
COPY --from=build /app/orders-service/dist orders-service/dist/

USER appuser
EXPOSE 50051 9090

CMD ["node", "orders-service/dist/index.js"]
