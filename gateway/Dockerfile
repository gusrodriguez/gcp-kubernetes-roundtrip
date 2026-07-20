# --- Build stage ---
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY proto/package.json proto/
COPY gateway/package.json gateway/
COPY orders-service/package.json orders-service/
COPY processing-service/package.json processing-service/

RUN yarn install --immutable

COPY tsconfig.base.json ./
COPY proto/ proto/
COPY gateway/ gateway/

RUN yarn workspace @gcp-k8s-roundtrip/proto build && \
    yarn workspace @gcp-k8s-roundtrip/gateway build

# --- Runtime stage ---
FROM node:20-alpine AS runtime
RUN corepack enable
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY proto/package.json proto/
COPY gateway/package.json gateway/
COPY orders-service/package.json orders-service/
COPY processing-service/package.json processing-service/

RUN yarn workspaces focus @gcp-k8s-roundtrip/proto @gcp-k8s-roundtrip/gateway --production

COPY --from=build /app/proto/dist proto/dist/
COPY --from=build /app/proto/order.proto proto/
COPY --from=build /app/gateway/dist gateway/dist/

USER appuser
EXPOSE 4000 9092

CMD ["node", "gateway/dist/index.js"]
