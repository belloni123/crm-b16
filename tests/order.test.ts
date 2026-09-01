import assert from 'node:assert/strict';
import test from 'node:test';
import { assertExactOrder } from '../lib/order';

test('aceita a mesma coleção em uma nova ordem', () => {
  assert.doesNotThrow(() => assertExactOrder(['a', 'b', 'c'], ['c', 'a', 'b'], 'itens'));
});

test('rejeita item ausente, externo, repetido ou lista de origem inválida', () => {
  assert.throws(() => assertExactOrder(['a', 'b', 'c'], ['a', 'b'], 'itens'), /exatamente/);
  assert.throws(() => assertExactOrder(['a', 'b', 'c'], ['a', 'b', 'x'], 'itens'), /exatamente/);
  assert.throws(() => assertExactOrder(['a', 'b', 'c'], ['a', 'a', 'c'], 'itens'), /exatamente/);
  assert.throws(() => assertExactOrder(['a', 'a'], ['a', 'a'], 'itens'), /exatamente/);
});

test('aceita uma coleção vazia sem inventar IDs', () => {
  assert.doesNotThrow(() => assertExactOrder([], [], 'itens'));
});
