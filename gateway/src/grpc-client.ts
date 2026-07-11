import * as grpc from '@grpc/grpc-js';
import { OrderServiceClient } from '@gcp-k8s-roundtrip/proto';
import type {
  SubmitOrderRequest,
  SubmitOrderResponse,
  GetOrderRequest,
  ListOrdersRequest,
  Order,
  ListOrdersResponse,
} from '@gcp-k8s-roundtrip/proto';
import { logger } from './logger';

const ORDERS_SERVICE_URL = process.env.ORDERS_SERVICE_URL || 'localhost:50051';

const client = new OrderServiceClient(
  ORDERS_SERVICE_URL,
  grpc.credentials.createInsecure(),
) as any;

logger.info({ url: ORDERS_SERVICE_URL }, 'gRPC client configured');

function withMetadata(correlationId: string): grpc.Metadata {
  const metadata = new grpc.Metadata();
  metadata.set('x-correlation-id', correlationId);
  return metadata;
}

export function submitOrder(
  input: SubmitOrderRequest,
  correlationId: string,
): Promise<SubmitOrderResponse> {
  return new Promise((resolve, reject) => {
    client.Submit(input, withMetadata(correlationId), (err: any, res: SubmitOrderResponse) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

export function getOrder(orderId: string): Promise<Order> {
  return new Promise((resolve, reject) => {
    const req: GetOrderRequest = { orderId };
    client.Get(req, (err: any, res: Order) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

export function listOrders(limit: number): Promise<ListOrdersResponse> {
  return new Promise((resolve, reject) => {
    const req: ListOrdersRequest = { limit };
    client.List(req, (err: any, res: ListOrdersResponse) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}
