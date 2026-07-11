# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY proto/package.json proto/
COPY gateway/package.json gateway/

RUN npm ci --workspace=@gcp-k8s-roundtrip/proto --workspace=@gcp-k8s-roundtrip/gateway

COPY tsconfig.base.json ./
COPY proto/ proto/
COPY gateway/ gateway/

RUN npm run build --workspace=@gcp-k8s-roundtrip/proto && \
    npm run build --workspace=@gcp-k8s-roundtrip/gateway

# --- Runtime stage ---
FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app

COPY package.json package-lock.json ./
COPY proto/package.json proto/
COPY gateway/package.json gateway/

RUN npm ci --workspace=@gcp-k8s-roundtrip/proto --workspace=@gcp-k8s-roundtrip/gateway --omit=dev

COPY --from=build /app/proto/dist proto/dist/
COPY --from=build /app/proto/order.proto proto/
COPY --from=build /app/gateway/dist gateway/dist/

USER appuser
EXPOSE 4000 9092

CMD ["node", "gateway/dist/index.js"]
