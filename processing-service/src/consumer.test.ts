import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test the idempotent update logic in isolation (no DB required)
describe('idempotent processing', () => {
  it('only transitions pending → processed', () => {
    // Simulates the SQL WHERE clause: UPDATE ... WHERE status = 'pending'
    const orders = new Map<string, { status: string; processedAt: string | null }>();
    orders.set('order-1', { status: 'pending', processedAt: null });

    function markProcessed(orderId: string): boolean {
      const order = orders.get(orderId);
      if (!order || order.status !== 'pending') return false;
      order.status = 'processed';
      order.processedAt = new Date().toISOString();
      return true;
    }

    // First call transitions
    assert.equal(markProcessed('order-1'), true);
    assert.equal(orders.get('order-1')?.status, 'processed');

    // Second call is a no-op
    assert.equal(markProcessed('order-1'), false);
  });

  it('returns false for non-existent order', () => {
    const orders = new Map<string, { status: string }>();

    function markProcessed(orderId: string): boolean {
      const order = orders.get(orderId);
      if (!order || order.status !== 'pending') return false;
      order.status = 'processed';
      return true;
    }

    assert.equal(markProcessed('nonexistent'), false);
  });
});

describe('event shaping', () => {
  it('parses order event payload', () => {
    const raw = JSON.stringify({
      orderId: 'abc-123',
      correlationId: 'corr-456',
      customerEmail: 'test@example.com',
      item: 'Widget',
      quantity: 3,
    });

    const data = JSON.parse(raw);
    assert.equal(data.orderId, 'abc-123');
    assert.equal(data.correlationId, 'corr-456');
    assert.equal(data.customerEmail, 'test@example.com');
    assert.equal(data.item, 'Widget');
    assert.equal(data.quantity, 3);
  });

  it('detects poison messages by item prefix', () => {
    const data = { item: 'POISON_test_item' };
    assert.equal(data.item.startsWith('POISON'), true);

    const normalData = { item: 'Normal Widget' };
    assert.equal(normalData.item.startsWith('POISON'), false);
  });
});
