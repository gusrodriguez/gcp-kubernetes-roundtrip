# gcp-kubernetes-roundtrip

[![CI](https://github.com/gusrodriguez/gcp-kubernetes-roundtrip/actions/workflows/ci.yml/badge.svg)](https://github.com/gusrodriguez/gcp-kubernetes-roundtrip/actions/workflows/ci.yml)

End-to-end event-driven microservices on Kubernetes — the **containerized** counterpart to [`azure-serverless-roundtrip`](https://github.com/gusrodriguez/azure-serverless-roundtrip). Both repos implement the same architectural pattern (HTTP → message broker → async consumer → database, with correlation IDs, DLQ handling, and observability) but with opposite infrastructure philosophies. The serverless version uses Azure Functions, Service Bus, and Cosmos DB — fully managed, pay-per-invocation, zero operational ownership. This one runs long-lived processes, an in-cluster message broker, self-hosted Postgres, connection pools, and self-managed observability.

### Serverless vs Containerized at a glance

|                        | [azure-serverless-roundtrip](https://github.com/gusrodriguez/azure-serverless-roundtrip) | gcp-kubernetes-roundtrip (this repo) |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------ |
| Compute                | Azure Functions (pay-per-invocation)                                                     | Kubernetes pods (long-running)       |
| Message broker         | Service Bus (managed)                                                                    | NATS JetStream (self-hosted)         |
| Database               | Cosmos DB (managed)                                                                      | Postgres StatefulSet (self-hosted)   |
| Dead-letter queue      | Built-in (one config flag)                                                               | Built from primitives (advisories)   |
| Observability          | Application Insights (automatic)                                                         | Prometheus + Grafana (manual)        |
| Connection pooling     | N/A (cold starts per invocation)                                                         | Long-lived pools (serverfull luxury) |
| CI end-to-end test     | Requires live Azure resources                                                            | Fully local in kind (zero cost)      |
| Infrastructure-as-code | Pulumi → Azure                                                                           | Pulumi → GCP                         |
| External API           | HTTP triggers (REST)                                                                     | GraphQL (graphql-yoga)               |
| Internal communication | Service Bus queue trigger                                                                | gRPC + NATS pub/sub                  |

```mermaid
graph TD
    Internet([Internet]) -->|GraphQL| GW[Gateway]
    GW -->|gRPC| OS[Orders Service]
    OS -->|INSERT| PG[(Postgres)]
    OS -->|publish orders.created| NATS[NATS JetStream]
    NATS -->|consume durable| PS[Processing Service]
    PS -->|UPDATE status=processed| PG
    PS -.->|advisory max_deliveries| DLQ[DLQ Stream]
    PROM[Prometheus] -->|scrape /metrics| GW
    PROM -->|scrape /metrics| OS
    PROM -->|scrape /metrics| PS
    PROM --> GRAF[Grafana]
```

## The round trip

A `submitOrder` GraphQL mutation returns `{ orderId, correlationId, status: "pending" }` immediately; the order travels gateway → gRPC → Postgres insert → `orders.created` event on JetStream → durable consumer → `status: processed`. The consumer acks only after the DB write succeeds. On the failure path, `maxDeliver: 5` exhaustion triggers a JetStream advisory, and the DLQ handler fetches the original message by stream sequence and republishes it to the `DLQ` stream.

### Following a correlation ID

Every pino log line across all three services includes `{ correlationId }`. To trace a single order:

```bash
# Across all services at once
kubectl logs -l app.kubernetes.io/part-of=roundtrip --all-containers | grep "abc-123-def"

# Or per service
kubectl logs -l app=gateway | grep "abc-123-def"
kubectl logs -l app=orders-service | grep "abc-123-def"
kubectl logs -l app=processing-service | grep "abc-123-def"

# In the database
kubectl exec -it roundtrip-postgres-0 -- psql -U roundtrip -c \
  "SELECT id, correlation_id, status, created_at, processed_at FROM orders WHERE correlation_id = 'abc-123-def'"
```

The correlation ID travels: GraphQL request → gRPC metadata (`x-correlation-id`) → NATS message header (`Nats-Correlation-Id`) → processing logs → DB row. One ID, full observability.

## Design decisions

### GraphQL at the edge, gRPC inside — [`gateway/`](gateway/), [`proto/`](proto/)

GraphQL serves the external API: flexible queries, self-documenting schema, single ingress point. Internal service-to-service communication uses gRPC: typed contracts from `.proto` files and efficient binary serialization.

### Sync (gRPC) vs async (NATS) boundaries — [`orders-service/`](orders-service/)

The gRPC call is synchronous (validate → insert → publish → respond), but processing is asynchronous via JetStream: temporal decoupling, buffering under load, and independent deployment of processing logic without touching the write path.

### NATS JetStream in-cluster vs managed Pub/Sub — [`charts/roundtrip/`](charts/roundtrip/)

Running NATS inside the cluster makes the architecture fully self-contained and testable in CI with zero cloud credentials.

### DLQ built from primitives — [`processing-service/`](processing-service/)

JetStream doesn't ship a dead-letter queue; it ships the primitives to build one: advisory events on delivery exhaustion, stream sequence numbers to fetch the failed message, and plain publish to route it. The DLQ handler listens to `$JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES.ORDERS.*`, fetches the exhausted message by stream sequence, and republishes it to a `DLQ` stream.

### Shared Postgres, deliberately

Both services read/write the same `orders` table in one Postgres instance. Database-per-service buys deploy-time independence but introduces distributed consistency problems (sagas, cross-service queries) that a one-table reference repo shouldn't pretend to have.

### Postgres in-cluster (StatefulSet) vs Cloud SQL — [`charts/roundtrip/`](charts/roundtrip/)

A StatefulSet with a 1Gi PVC is sufficient for a reference repo and essential for CI (kind, no cloud services). In production, Cloud SQL wins.

### Long-lived connection pools

Each service creates a `pg.Pool` at module scope that stays warm for the process lifetime.

### Prometheus/Grafana self-hosted — [`charts/roundtrip/`](charts/roundtrip/)

Observability: dashboards, and alerting rules live in the repo as code, deployed with the same Helm release as the services.

### kind-in-CI as the proof strategy — [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

Every CI run spins up a real Kubernetes cluster (kind), deploys everything with Helm, and executes an end-to-end test of the full flow: GraphQL → gRPC → Postgres → NATS → consumer → DB update. The cluster dies with the runner. No cloud account, no credentials or cost.

### Path-filtered monorepo CI — [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

Path filters detect which services changed: touch only `gateway/` and only gateway gets built, tested, and containerized; the e2e runs only when a service changes.

## Run locally

Prerequisites: Docker, kind, kubectl, Helm, Node 20, npm.

```bash
# Install dependencies and build
npm ci
npm run build

# Build Docker images
make build

# Create kind cluster, deploy everything, wait for readiness
make kind-up

# Run the e2e smoke test
make e2e

# Tear down
make kind-down
```

## Deploy to GKE

### One-time setup

1. **Create infrastructure** with Pulumi:

   ```bash
   cd infra
   npm install
   pulumi up
   ```

   This creates a zonal GKE cluster, Artifact Registry, service account, and Workload Identity Federation for GitHub Actions.

2. **Configure GitHub secrets** (from Pulumi outputs):

   - `WIF_PROVIDER`: Workload Identity Federation provider name
   - `WIF_SERVICE_ACCOUNT`: CI service account email

3. **Update** `infra/index.ts` with your GitHub org/repo for the WIF binding.

### Deploy cycle

```bash
# Scale up nodes (cluster control plane is always free for zonal)
gcloud container clusters resize roundtrip-cluster --zone us-central1-a --num-nodes 2

# Deploy via GitHub Actions: trigger the deploy-gke workflow manually
# Or deploy locally:
make build
# Push images, helm upgrade (see deploy-gke.yml for the exact commands)

# Scale back to 0 when done
gcloud container clusters resize roundtrip-cluster --zone us-central1-a --num-nodes 0
```

### Cost

- **Zonal control plane**: free (GKE free tier)
- **Nodes**: billed only while scaled up (~$0.03/hr per e2-medium)
- **Everything else** (NATS, Postgres, Prometheus, Grafana): runs in-cluster, no additional GCP charges

### Teardown

```bash
cd infra
pulumi destroy
```

## Project structure

```
gateway/               # GraphQL service (graphql-yoga)
orders-service/        # gRPC server + NATS publisher
processing-service/    # JetStream consumer + DLQ handler
proto/                 # Shared .proto files + TS types
charts/roundtrip/      # Umbrella Helm chart with subcharts
infra/                 # Pulumi: GKE + Artifact Registry + IAM
scripts/               # e2e test script
.github/workflows/     # CI (kind) + Deploy (GKE)
```