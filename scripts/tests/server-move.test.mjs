// Gleiche Kennung unter neuer Adresse: nur im Heimnetz oder unter demselben Hostnamen, übernommen nur bei gleichem Konto
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adoptsMovedConnection, isPlausibleMove } from '../../src/api/addresses.ts';

test('neue Adresse im Heimnetz oder gleicher Hostname gilt als derselbe Server', () => {
  assert.equal(isPlausibleMove('http://192.168.178.24:8000/api/v1', 'http://192.168.178.31:8000/api/v1'), true);
  assert.equal(isPlausibleMove('http://pc-wohnzimmer.local:8000/api/v1', 'http://10.0.0.5:8000/api/v1'), true);
  assert.equal(isPlausibleMove('http://verein.example:8000/api/v1', 'https://verein.example/api/v1'), true);
});

test('fremder Server mit nachgemachter Kennung und öffentlicher Adresse gilt als neu', () => {
  assert.equal(isPlausibleMove('https://taleward.verein.example/api/v1', 'https://boese.example/api/v1'), false);
  assert.equal(isPlausibleMove('http://192.168.178.24:8000/api/v1', 'https://boese.example/api/v1'), false);
  assert.equal(isPlausibleMove('https://taleward.verein.example/api/v1', 'http://192.168.178.24:8000/api/v1'), false);
  assert.equal(isPlausibleMove('kaputt', 'http://192.168.178.24/api/v1'), false);
});

test('Verbindung wird nur bei gleichem Konto übernommen', () => {
  assert.equal(adoptsMovedConnection('u-1', 'u-1'), true);
  assert.equal(adoptsMovedConnection('u-1', 'u-2'), false);
  assert.equal(adoptsMovedConnection(null, 'u-1'), false);
  assert.equal(adoptsMovedConnection(undefined, undefined), false);
});
