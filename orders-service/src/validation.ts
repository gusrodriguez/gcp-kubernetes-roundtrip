import type { SubmitOrderRequest } from '@gcp-k8s-roundtrip/proto';

export interface ValidationError {
  field: string;
  message: string;
}

export function validateSubmitOrder(input: SubmitOrderRequest): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!input.customerEmail || !input.customerEmail.includes('@')) {
    errors.push({ field: 'customerEmail', message: 'Valid email is required' });
  }

  if (!input.item || input.item.trim().length === 0) {
    errors.push({ field: 'item', message: 'Item is required' });
  }

  if (!input.quantity || input.quantity < 1) {
    errors.push({ field: 'quantity', message: 'Quantity must be at least 1' });
  }

  return errors;
}
