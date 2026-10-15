// Links: Dienst an der Adresse erkennen (Markenzeichen bzw. allgemeines Zeichen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkInfo } from '../../src/links/linkKind.ts';

test('Bekannte Dienste', () => {
  assert.deepEqual(linkInfo('https://discord.gg/abc'), { kind: 'chat', brand: 'discord' });
  assert.deepEqual(linkInfo('https://www.youtube.com/watch?v=1'), { kind: 'video', brand: 'youtube' });
  assert.deepEqual(linkInfo('https://youtu.be/1'), { kind: 'video', brand: 'youtube' });
  assert.deepEqual(linkInfo('https://us02web.zoom.us/j/123'), { kind: 'chat', brand: 'zoom' });
  assert.deepEqual(linkInfo('https://docs.google.com/document/d/x'), { kind: 'docs', brand: 'googledocs' });
  assert.deepEqual(linkInfo('https://drive.google.com/drive/folders/x'), { kind: 'docs', brand: 'googledrive' });
  assert.deepEqual(linkInfo('https://app.roll20.net/join/1'), { kind: 'table', brand: 'roll20' });
  assert.deepEqual(linkInfo('https://open.spotify.com/playlist/x'), { kind: 'music', brand: 'spotify' });
  assert.deepEqual(linkInfo('https://cloud.nextcloud.verein.de/s/abc'), { kind: 'docs', brand: 'nextcloud' });
});

test('Ohne Markenzeichen: nur die Art', () => {
  assert.deepEqual(linkInfo('https://www.owlbear.rodeo/room/x'), { kind: 'table', brand: null });
  assert.deepEqual(linkInfo('https://onedrive.live.com/x'), { kind: 'docs', brand: null });
  assert.deepEqual(linkInfo('https://beispiel.example/karte.pdf'), { kind: 'docs', brand: null });
  assert.deepEqual(linkInfo('https://tabletopaudio.com/'), { kind: 'music', brand: null });
});

test('Nicht täuschen lassen', () => {
  // Fremde Namen, die nur so ähnlich aussehen, bekommen kein Markenzeichen
  assert.deepEqual(linkInfo('https://discord.gg.example.com/x'), { kind: 'web', brand: null });
  assert.deepEqual(linkInfo('https://notdiscord.com/x'), { kind: 'web', brand: null });
  assert.deepEqual(linkInfo('https://example.com/youtube.com'), { kind: 'web', brand: null });
  assert.deepEqual(linkInfo('kein link'), { kind: 'web', brand: null });
});
