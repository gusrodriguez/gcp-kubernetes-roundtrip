import { createSchema } from 'graphql-yoga';
import { v4 as uuid } from 'uuid';
import * as grpcClient from './grpc-client';
import { childLogger } from './logger';
import { graphqlRequestsTotal, graphqlRequestDuration } from './metrics';

// graphql-yoga chosen over Apollo Server: lighter, built on Web Standards (fetch API),
// first-class Envelop plugin system for cross-cutting concerns, and excellent TypeScript
// support. Apollo's federation and managed gateway features add weight without value
// for a single-service GraphQL edge.

export const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Order {
      orderId: ID!
      correlationId: String!
      customerEmail: String!
      item: String!
      quantity: Int!
      status: String!
      createdAt: String!
      processedAt: String
    }

    type SubmitOrderResult {
      orderId: ID!
      correlationId: String!
      status: String!
    }

    input SubmitOrderInput {
      customerEmail: String!
      item: String!
      quantity: Int!
    }

    type Query {
      order(id: ID!): Order
      orders(limit: Int): [Order!]!
    }

    type Mutation {
      submitOrder(input: SubmitOrderInput!): SubmitOrderResult!
    }
  `,
  resolvers: {
    Query: {
      async order(_parent, args: { id: string }) {
        const end = graphqlRequestDuration.startTimer({ operation: 'order' });
        try {
          const result = await grpcClient.getOrder(args.id);
          graphqlRequestsTotal.inc({ operation: 'order', status: 'ok' });
          return result;
        } catch (err) {
          graphqlRequestsTotal.inc({ operation: 'order', status: 'error' });
          throw err;
        } finally {
          end();
        }
      },
      async orders(_parent, args: { limit?: number }) {
        const end = graphqlRequestDuration.startTimer({ operation: 'orders' });
        try {
          const result = await grpcClient.listOrders(args.limit || 50);
          graphqlRequestsTotal.inc({ operation: 'orders', status: 'ok' });
          return result.orders;
        } catch (err) {
          graphqlRequestsTotal.inc({ operation: 'orders', status: 'error' });
          throw err;
        } finally {
          end();
        }
      },
    },
    Mutation: {
      async submitOrder(_parent, args: { input: { customerEmail: string; item: string; quantity: number } }) {
        const correlationId = uuid();
        const log = childLogger(correlationId);
        const end = graphqlRequestDuration.startTimer({ operation: 'submitOrder' });

        try {
          log.info({ input: args.input }, 'Submitting order via GraphQL');
          const result = await grpcClient.submitOrder(args.input, correlationId);
          graphqlRequestsTotal.inc({ operation: 'submitOrder', status: 'ok' });
          log.info({ orderId: result.orderId, status: result.status }, 'Order submitted');
          return result;
        } catch (err) {
          graphqlRequestsTotal.inc({ operation: 'submitOrder', status: 'error' });
          log.error({ err }, 'submitOrder failed');
          throw err;
        } finally {
          end();
        }
      },
    },
  },
});
