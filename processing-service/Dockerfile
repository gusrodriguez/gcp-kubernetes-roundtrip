# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY processing-service/package.json processing-service/

RUN npm ci --workspace=@gcp-k8s-roundtrip/processing-service

COPY tsconfig.base.json ./
COPY processing-service/ processing-service/

RUN npm run build --workspace=@gcp-k8s-roundtrip/processing-service

# --- Runtime stage ---
FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app

COPY package.json package-lock.json ./
COPY processing-service/package.json processing-service/

RUN npm ci --workspace=@gcp-k8s-roundtrip/processing-service --omit=dev

COPY --from=build /app/processing-service/dist processing-service/dist/

USER appuser
EXPOSE 9091

CMD ["node", "processing-service/dist/index.js"]
