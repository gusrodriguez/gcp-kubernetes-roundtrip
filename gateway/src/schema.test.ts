import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('correlation ID generation', () => {
  it('generates a valid UUID v4', () => {
    // Test the UUID format used for correlation IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    // Import dynamically to avoid side effects
    const { v4: uuid } = require('uuid');
    const id = uuid();
    assert.match(id, uuidRegex);
  });

  it('generates unique IDs per call', () => {
    const { v4: uuid } = require('uuid');
    const ids = new Set(Array.from({ length: 100 }, () => uuid()));
    assert.equal(ids.size, 100);
  });
});

describe('GraphQL schema structure', () => {
  it('schema exports a valid schema object', () => {
    const { schema } = require('./schema');
    assert.ok(schema);
  });
});
