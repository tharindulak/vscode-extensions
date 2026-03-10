/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import * as vscode from 'vscode';
import { HurlNotebookSerializer, hurlTextToNotebookData } from '../../src/notebook/HurlNotebookSerializer';
import { TextEncoder } from 'util';

// vscode is redirected to tests/__mocks__/vscode.ts via jest moduleNameMapper.

const PLAINTEXT = 'plaintext';
const token = { isCancellationRequested: false } as vscode.CancellationToken;

// ─── hurlTextToNotebookData ───────────────────────────────────────────────────

describe('hurlTextToNotebookData', () => {

    describe('cell count', () => {
        it('creates one cell for a single request', () => {
            const hurl = 'GET https://example.com\nHTTP 200';
            const data = hurlTextToNotebookData(hurl);
            expect(data.cells).toHaveLength(1);
        });

        it('creates one cell per request block for multiple requests', () => {
            const hurl = [
                '# @name First',
                'GET https://example.com/a',
                'HTTP 200',
                '',
                '# @name Second',
                'POST https://example.com/b',
                'HTTP 201',
                '',
                '# @name Third',
                'DELETE https://example.com/c',
                'HTTP 204'
            ].join('\n');

            const data = hurlTextToNotebookData(hurl);
            expect(data.cells).toHaveLength(3);
        });

        it('yields one empty cell when input is blank', () => {
            expect(hurlTextToNotebookData('').cells).toHaveLength(1);
            expect(hurlTextToNotebookData('   ').cells).toHaveLength(1);
        });

        it('yields one empty cell when content has no HTTP method line', () => {
            // A file with only a collection name comment and no requests
            const data = hurlTextToNotebookData('# @collectionName My API\n');
            expect(data.cells).toHaveLength(1);
        });
    });

    describe('cell kind and language', () => {
        it('produces Code cells with plaintext language', () => {
            const data = hurlTextToNotebookData('GET https://example.com\nHTTP 200');
            expect(data.cells[0].kind).toBe(vscode.NotebookCellKind.Code);
            expect(data.cells[0].languageId).toBe(PLAINTEXT);
        });
    });

    describe('cell value (raw text)', () => {
        it('cell value contains the request method and URL', () => {
            const data = hurlTextToNotebookData('GET https://example.com/users\nHTTP 200');
            expect(data.cells[0].value).toContain('GET https://example.com/users');
        });

        it('cell value preserves the HTTP status assertion line', () => {
            const data = hurlTextToNotebookData('DELETE https://example.com/items/1\nHTTP 204');
            expect(data.cells[0].value).toContain('HTTP 204');
        });

        it('cell value includes request headers', () => {
            const hurl = [
                'POST https://example.com/posts',
                'Content-Type: application/json',
                'Authorization: Bearer token123',
                '',
                '{"title":"foo"}',
                'HTTP 201'
            ].join('\n');
            const data = hurlTextToNotebookData(hurl);
            expect(data.cells[0].value).toContain('Content-Type: application/json');
            expect(data.cells[0].value).toContain('Authorization: Bearer token123');
        });

        it('cell value includes [Asserts] section', () => {
            const hurl = [
                'GET https://example.com',
                'HTTP 200',
                '[Asserts]',
                'jsonpath "$.id" == 1'
            ].join('\n');
            const data = hurlTextToNotebookData(hurl);
            expect(data.cells[0].value).toContain('[Asserts]');
            expect(data.cells[0].value).toContain('jsonpath "$.id" == 1');
        });

        it('each cell contains only its own request block', () => {
            const hurl = [
                '# @name Alpha',
                'GET https://example.com/alpha',
                'HTTP 200',
                '',
                '# @name Beta',
                'POST https://example.com/beta',
                'HTTP 201'
            ].join('\n');

            const data = hurlTextToNotebookData(hurl);
            expect(data.cells[0].value).not.toContain('beta');
            expect(data.cells[1].value).not.toContain('alpha');
        });
    });

    describe('cell metadata', () => {
        it('attaches name, method and url parsed from the block', () => {
            const hurl = '# @name ListUsers\nGET https://example.com/users\nHTTP 200';
            const meta = hurlTextToNotebookData(hurl).cells[0].metadata as Record<string, unknown>;

            expect(meta.name).toBe('ListUsers');
            expect(meta.method).toBe('GET');
            expect(meta.url).toBe('https://example.com/users');
        });

        it('method and url are set even without a @name comment', () => {
            const hurl = 'PATCH https://example.com/items/5\nHTTP 200';
            const meta = hurlTextToNotebookData(hurl).cells[0].metadata as Record<string, unknown>;

            expect(meta.name).toBeUndefined();
            expect(meta.method).toBe('PATCH');
            expect(meta.url).toBe('https://example.com/items/5');
        });

        it('sets metadata independently for each cell', () => {
            const hurl = [
                '# @name Alpha',
                'DELETE https://example.com/alpha',
                'HTTP 204',
                '',
                '# @name Beta',
                'PUT https://example.com/beta',
                'HTTP 200'
            ].join('\n');

            const cells = hurlTextToNotebookData(hurl).cells;
            const [a, b] = cells.map(c => c.metadata as Record<string, unknown>);

            expect(a.name).toBe('Alpha');
            expect(a.method).toBe('DELETE');
            expect(b.name).toBe('Beta');
            expect(b.method).toBe('PUT');
        });
    });
});

// ─── HurlNotebookSerializer class ────────────────────────────────────────────

describe('HurlNotebookSerializer', () => {
    const serializer = new HurlNotebookSerializer();

    describe('deserializeNotebook', () => {
        it('decodes UTF-8 bytes and returns the correct cell count', async () => {
            const hurl = 'GET https://a.com\nHTTP 200\n\nPOST https://b.com\nHTTP 201';
            const content = new TextEncoder().encode(hurl);

            const data = await serializer.deserializeNotebook(content, token);
            expect(data.cells).toHaveLength(2);
        });

        it('returns a single empty cell for empty bytes', async () => {
            const data = await serializer.deserializeNotebook(new Uint8Array(), token);
            expect(data.cells).toHaveLength(1);
            expect(data.cells[0].value).toBe('');
        });
    });

    describe('serializeNotebook', () => {
        it('encodes cell values back to hurl text', async () => {
            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    'GET https://a.com\nHTTP 200',
                    PLAINTEXT
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    'POST https://b.com\nHTTP 201',
                    PLAINTEXT
                )
            ];
            const notebookData = new vscode.NotebookData(cells);
            const bytes = await serializer.serializeNotebook(notebookData, token);
            const text = Buffer.from(bytes).toString('utf-8');

            expect(text).toContain('GET https://a.com');
            expect(text).toContain('POST https://b.com');
        });

        it('separates cells with a blank line', async () => {
            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    'GET https://a.com\nHTTP 200',
                    PLAINTEXT
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    'DELETE https://b.com\nHTTP 204',
                    PLAINTEXT
                )
            ];
            const bytes = await serializer.serializeNotebook(new vscode.NotebookData(cells), token);
            const text = Buffer.from(bytes).toString('utf-8');

            // composeHurlDocument uses double newlines between blocks
            expect(text).toMatch(/HTTP 200\s*\n\n.*DELETE/s);
        });
    });

    describe('round-trip', () => {
        it('preserves all request blocks through deserialize → serialize', async () => {
            const original = [
                '# @name Alpha',
                'GET https://example.com/alpha',
                'HTTP 200',
                '',
                '# @name Beta',
                'DELETE https://example.com/beta',
                'HTTP 204'
            ].join('\n');

            const encoded = new TextEncoder().encode(original);
            const deserialized = await serializer.deserializeNotebook(encoded, token);
            const reEncoded = await serializer.serializeNotebook(deserialized, token);
            const roundTripped = Buffer.from(reEncoded).toString('utf-8');

            expect(roundTripped).toContain('GET https://example.com/alpha');
            expect(roundTripped).toContain('DELETE https://example.com/beta');
        });

        it('roundtrip produces the same number of parseable cells', async () => {
            const original = 'GET https://a.com\nHTTP 200\n\nPOST https://b.com\nHTTP 201';
            const encoded = new TextEncoder().encode(original);
            const first = await serializer.deserializeNotebook(encoded, token);
            const reEncoded = await serializer.serializeNotebook(first, token);
            const second = await serializer.deserializeNotebook(reEncoded, token);

            expect(second.cells).toHaveLength(first.cells.length);
        });
    });
});
