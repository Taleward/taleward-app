// Unterlagen in der Sammlung: was die App selbst zeigt, was der Server als Bogen annimmt
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileKind, formatSize, serverAccepts } from '../../src/characters/files.ts';

test('PDF, Bild und Text zeigt die App selbst, Word öffnet ein Programm', () => {
  assert.equal(fileKind({ name: 'bogen.PDF', type: '' }), 'pdf');
  assert.equal(fileKind({ name: 'karte', type: 'image/jpeg' }), 'image');
  assert.equal(fileKind({ name: 'notizen.md', type: '' }), 'text');
  assert.equal(fileKind({ name: 'bogen.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'other');
  assert.equal(fileKind({ name: 'bild.svg', type: 'image/svg+xml' }), 'other');
});

test('abgeben nur, was der Server annimmt', () => {
  assert.ok(serverAccepts({ name: 'bogen.docx', type: '' }));
  assert.ok(serverAccepts({ name: 'Bogen.PDF', type: '' }));
  assert.ok(!serverAccepts({ name: 'bogen.odt', type: '' }));
  assert.ok(!serverAccepts({ name: 'foto.jpg', type: 'image/jpeg' }));
});

test('Größen lesbar', () => {
  assert.equal(formatSize(512), '512 B');
  assert.equal(formatSize(2048), '2 KB');
  assert.equal(formatSize(5 * 1024 * 1024 + 300000), '5,3 MB');
});
