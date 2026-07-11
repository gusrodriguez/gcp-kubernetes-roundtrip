import path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_PATH = path.join(__dirname, '..', 'order.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition) as any;

export const OrderServiceClient = proto.orders.OrderService as typeof grpc.Client;
export const orderServiceDefinition = proto.orders.OrderService.service;

export const PROTO_PATH_RESOLVED = PROTO_PATH;

// Re-export types for use across services
export interface SubmitOrderRequest {
  customerEmail: string;
  item: string;
  quantity: number;
}

export interface SubmitOrderResponse {
  orderId: string;
  correlationId: string;
  status: string;
}

export interface GetOrderRequest {
  orderId: string;
}

export interface ListOrdersRequest {
  limit: number;
}

export interface Order {
  orderId: string;
  correlationId: string;
  customerEmail: string;
  item: string;
  quantity: number;
  status: string;
  createdAt: string;
  processedAt: string;
}

export interface ListOrdersResponse {
  orders: Order[];
}
