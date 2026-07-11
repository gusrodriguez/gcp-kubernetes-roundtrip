import * as grpc from '@grpc/grpc-js';
import { v4 as uuid } from 'uuid';
import { orderServiceDefinition } from '@gcp-k8s-roundtrip/proto';
import { insertOrder, getOrder, listOrders, OrderRow } from './db';
import { publishOrderCreated } from './nats';
import { validateSubmitOrder } from './validation';
import { childLogger, logger } from './logger';
import { grpcRequestsTotal, grpcRequestDuration, ordersTotal } from './metrics';

function toProtoOrder(row: OrderRow) {
  return {
    orderId: row.id,
    correlationId: row.correlation_id,
    customerEmail: row.payload.customerEmail,
    item: row.payload.item,
    quantity: row.payload.quantity,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    processedAt: row.processed_at?.toISOString() || '',
  };
}

function getCorrelationId(metadata: grpc.Metadata): string {
  const values = metadata.get('x-correlation-id');
  return (values[0] as string) || uuid();
}

const handlers = {
  async Submit(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>,
  ) {
    const end = grpcRequestDuration.startTimer({ method: 'Submit' });
    const correlationId = getCorrelationId(call.metadata);
    const log = childLogger(correlationId);

    try {
      const input = call.request;
      const errors = validateSubmitOrder(input);
      if (errors.length > 0) {
        grpcRequestsTotal.inc({ method: 'Submit', status: 'INVALID_ARGUMENT' });
        end();
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: errors.map((e) => `${e.field}: ${e.message}`).join('; '),
        });
      }

      const orderId = uuid();
      const payload = {
        customerEmail: input.customerEmail,
        item: input.item,
        quantity: input.quantity,
      };

      await insertOrder(orderId, correlationId, payload);
      ordersTotal.inc({ status: 'pending' });
      log.info({ orderId }, 'Order inserted');

      await publishOrderCreated(orderId, correlationId, payload);

      grpcRequestsTotal.inc({ method: 'Submit', status: 'OK' });
      end();
      callback(null, { orderId, correlationId, status: 'pending' });
    } catch (err) {
      log.error({ err }, 'Submit failed');
      grpcRequestsTotal.inc({ method: 'Submit', status: 'INTERNAL' });
      end();
      callback({ code: grpc.status.INTERNAL, message: 'Internal error' });
    }
  },

  async Get(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>,
  ) {
    const end = grpcRequestDuration.startTimer({ method: 'Get' });
    try {
      const row = await getOrder(call.request.orderId);
      if (!row) {
        grpcRequestsTotal.inc({ method: 'Get', status: 'NOT_FOUND' });
        end();
        return callback({ code: grpc.status.NOT_FOUND, message: 'Order not found' });
      }
      grpcRequestsTotal.inc({ method: 'Get', status: 'OK' });
      end();
      callback(null, toProtoOrder(row));
    } catch (err) {
      logger.error({ err }, 'Get failed');
      grpcRequestsTotal.inc({ method: 'Get', status: 'INTERNAL' });
      end();
      callback({ code: grpc.status.INTERNAL, message: 'Internal error' });
    }
  },

  async List(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>,
  ) {
    const end = grpcRequestDuration.startTimer({ method: 'List' });
    try {
      const rows = await listOrders(call.request.limit);
      grpcRequestsTotal.inc({ method: 'List', status: 'OK' });
      end();
      callback(null, { orders: rows.map(toProtoOrder) });
    } catch (err) {
      logger.error({ err }, 'List failed');
      grpcRequestsTotal.inc({ method: 'List', status: 'INTERNAL' });
      end();
      callback({ code: grpc.status.INTERNAL, message: 'Internal error' });
    }
  },
};

export function createGrpcServer(): grpc.Server {
  const server = new grpc.Server();
  server.addService(orderServiceDefinition, handlers);
  return server;
}
