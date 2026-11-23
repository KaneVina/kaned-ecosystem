import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLinkProvider } from '../src/index.js';

test('drive folder links are recognised with their id', () => {
  for (const u of [
    'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing',
    'https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjKlMnOp',
  ]) {
    const p = detectLinkProvider(u);
    assert.equal(p.id, 'google-drive');
    assert.equal(p.kind, 'folder');
    assert.equal(p.folderId, '1AbCdEfGhIjKlMnOp');
  }
  assert.equal(detectLinkProvider('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view').folderId, undefined);
});
