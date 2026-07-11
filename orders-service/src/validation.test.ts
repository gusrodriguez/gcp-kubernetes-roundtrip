import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSubmitOrder } from './validation';

describe('validateSubmitOrder', () => {
  it('returns no errors for valid input', () => {
    const errors = validateSubmitOrder({
      customerEmail: 'alice@example.com',
      item: 'Widget',
      quantity: 2,
    });
    assert.equal(errors.length, 0);
  });

  it('rejects missing email', () => {
    const errors = validateSubmitOrder({
      customerEmail: '',
      item: 'Widget',
      quantity: 1,
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].field, 'customerEmail');
  });

  it('rejects email without @', () => {
    const errors = validateSubmitOrder({
      customerEmail: 'not-an-email',
      item: 'Widget',
      quantity: 1,
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].field, 'customerEmail');
  });

  it('rejects empty item', () => {
    const errors = validateSubmitOrder({
      customerEmail: 'a@b.com',
      item: '  ',
      quantity: 1,
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].field, 'item');
  });

  it('rejects zero quantity', () => {
    const errors = validateSubmitOrder({
      customerEmail: 'a@b.com',
      item: 'Widget',
      quantity: 0,
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].field, 'quantity');
  });

  it('returns multiple errors', () => {
    const errors = validateSubmitOrder({
      customerEmail: '',
      item: '',
      quantity: -1,
    });
    assert.equal(errors.length, 3);
  });
});
