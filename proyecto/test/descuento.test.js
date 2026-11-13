import { test } from 'node:test';
import assert from 'node:assert/strict';
import { precioFinal } from '../src/descuento.js';

test('un socio con una compra de 200 € paga 180 €', () => {
  assert.equal(precioFinal(200, true), 180);
});

test('el descuento empieza justo en 100 €', () => {
  assert.equal(precioFinal(100, true), 90);
});
