import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShellHello, shellOrigin } from '../../src/display/desktopShell.ts';

test('Programmfenster nur, wenn die App direkt in der Oberfläche auf diesem PC steckt', () => {
  assert.equal(shellOrigin(['http://localhost:51234'], 'http://localhost:8000', false), 'http://localhost:51234');
  assert.equal(shellOrigin(['http://127.0.0.1:51234'], 'http://localhost:8000', false), 'http://127.0.0.1:51234');
  assert.equal(shellOrigin([], 'http://localhost:8000', true), null);
  assert.equal(shellOrigin(['https://fremd.example'], 'http://localhost:8000', false), null);
  assert.equal(shellOrigin(['http://localhost:1', 'http://localhost:2'], 'http://localhost:8000', false), null);
  assert.equal(shellOrigin(['http://localhost:51234'], 'https://app.taleward.org', false), null);
  assert.equal(shellOrigin(undefined, 'http://localhost:8000', false), null);
});

test('Nachricht der Oberfläche: nur bekannte Hilfen', () => {
  assert.deepEqual(parseShellHello({ taleward: 'desktop', can: ['mic-settings', 'irgendwas'] }), ['mic-settings']);
  assert.equal(parseShellHello({ taleward: 'anders', can: [] }), null);
  assert.equal(parseShellHello('mic-settings'), null);
  assert.equal(parseShellHello(null), null);
});
