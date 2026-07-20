# --- Build stage ---
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY processing-service/package.json processing-service/
COPY proto/package.json proto/
COPY gateway/package.json gateway/
COPY orders-service/package.json orders-service/

RUN yarn install --immutable

COPY tsconfig.base.json ./
COPY processing-service/ processing-service/

RUN yarn workspace @gcp-k8s-roundtrip/processing-service build

# --- Runtime stage ---
FROM node:20-alpine AS runtime
RUN corepack enable
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY processing-service/package.json processing-service/
COPY proto/package.json proto/
COPY gateway/package.json gateway/
COPY orders-service/package.json orders-service/

RUN yarn workspaces focus @gcp-k8s-roundtrip/processing-service --production

COPY --from=build /app/processing-service/dist processing-service/dist/

USER appuser
EXPOSE 9091

CMD ["node", "processing-service/dist/index.js"]
