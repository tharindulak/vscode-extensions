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
import type { HurlFileResult, HurlRunResult } from '@wso2/api-tryit-hurl-runner';
import * as fsPromises from 'fs/promises';

// ─── Module mocks (must be declared before imports that use them) ─────────────

jest.mock('@wso2/api-tryit-hurl-runner', () => ({
    createHurlRunner: jest.fn()
}));

jest.mock('../../src/hurl/hurl-binary-manager', () => ({
    getHurlBinaryManager: jest.fn().mockReturnValue({
        resolveCommandPath: jest.fn().mockResolvedValue('/usr/local/bin/hurl')
    })
}));

jest.mock('fs/promises', () => ({
    mkdtemp: jest.fn().mockResolvedValue('/tmp/hurl-notebook-test'),
    writeFile: jest.fn().mockResolvedValue(undefined),
    rm: jest.fn().mockResolvedValue(undefined)
}));

// Import AFTER mocks are set up
import { HurlNotebookController } from '../../src/notebook/HurlNotebookController';
import { createHurlRunner } from '@wso2/api-tryit-hurl-runner';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal HurlFileResult for use in run result fixtures. */
function makeFileResult(overrides: Partial<HurlFileResult> = {}): HurlFileResult {
    return {
        filePath: '/tmp/hurl-notebook-test/cell.hurl',
        status: 'passed',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 50,
        entries: [],
        assertions: [],
        ...overrides
    };
}

/** Wrap a HurlFileResult in the outer HurlRunResult shell the controller reads. */
function makeRunResult(fileResult: HurlFileResult): HurlRunResult {
    const overallStatus = fileResult.status === 'passed' ? 'passed' : 'failed';
    return {
        runId: 'test-run-id',
        status: overallStatus,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: fileResult.durationMs,
        summary: {
            totalFiles: 1,
            passedFiles: overallStatus === 'passed' ? 1 : 0,
            failedFiles: overallStatus !== 'passed' ? 1 : 0,
            errorFiles: 0,
            skippedFiles: 0,
            totalEntries: fileResult.entries.length,
            passedEntries: fileResult.entries.filter(e => e.status === 'passed').length,
            failedEntries: fileResult.entries.filter(e => e.status !== 'passed').length
        },
        files: [fileResult],
        diagnostics: { commandLine: ['/usr/local/bin/hurl', 'cell.hurl'], warnings: [] }
    };
}

/** Build a minimal mock NotebookCell from raw text. */
function makeCell(text: string): vscode.NotebookCell {
    return { document: { getText: () => text } } as unknown as vscode.NotebookCell;
}

/** Extract the text rendered into cell output from an appendOutput call. */
function outputText(appendOutputMock: jest.Mock, callIndex = 0): string {
    const [arg] = appendOutputMock.mock.calls[callIndex];
    const outputs: vscode.NotebookCellOutput[] = Array.isArray(arg) ? arg : [arg];
    return outputs
        .flatMap(o => o.items)
        .map(item => Buffer.from(item.data).toString('utf-8'))
        .join('\n');
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('HurlNotebookController', () => {
    // Execution mock is rebuilt before every test
    let mockExecution: {
        start: jest.Mock;
        clearOutput: jest.Mock;
        appendOutput: jest.Mock;
        end: jest.Mock;
    };

    // Captured inner controller object returned by createNotebookController
    let mockNotebookController: {
        supportedLanguages: string[];
        supportsExecutionOrder: boolean;
        executeHandler: ((
            cells: vscode.NotebookCell[],
            notebook: vscode.NotebookDocument,
            controller: vscode.NotebookController
        ) => Promise<void>) | null;
        dispose: jest.Mock;
        createNotebookCellExecution: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockExecution = {
            start: jest.fn(),
            clearOutput: jest.fn().mockResolvedValue(undefined),
            appendOutput: jest.fn().mockResolvedValue(undefined),
            end: jest.fn()
        };

        mockNotebookController = {
            supportedLanguages: [],
            supportsExecutionOrder: false,
            executeHandler: null,
            dispose: jest.fn(),
            createNotebookCellExecution: jest.fn().mockReturnValue(mockExecution)
        };

        (vscode.notebooks.createNotebookController as jest.Mock).mockReturnValue(
            mockNotebookController
        );
    });

    /**
     * Construct the controller and return a helper that calls the captured
     * executeHandler directly, so tests can drive execution without VS Code.
     */
    function buildController() {
        const controller = new HurlNotebookController();
        const run = (cells: vscode.NotebookCell[]) =>
            mockNotebookController.executeHandler!(
                cells,
                {} as vscode.NotebookDocument,
                mockNotebookController as unknown as vscode.NotebookController
            );
        return { controller, run };
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    describe('constructor', () => {
        it('registers the controller with the correct ids', () => {
            new HurlNotebookController();
            expect(vscode.notebooks.createNotebookController).toHaveBeenCalledWith(
                'api-tryit-hurl-notebook-controller',
                'api-tryit-hurl-notebook',
                'Hurl Runner'
            );
        });

        it('sets supportsExecutionOrder to true on the inner controller', () => {
            new HurlNotebookController();
            expect(mockNotebookController.supportsExecutionOrder).toBe(true);
        });

        it('assigns the executeHandler on the inner controller', () => {
            new HurlNotebookController();
            expect(typeof mockNotebookController.executeHandler).toBe('function');
        });
    });

    // ─── dispose ─────────────────────────────────────────────────────────────

    it('dispose() calls dispose on the inner controller', () => {
        const { controller } = buildController();
        controller.dispose();
        expect(mockNotebookController.dispose).toHaveBeenCalled();
    });

    // ─── Empty cell ───────────────────────────────────────────────────────────

    describe('empty cell', () => {
        it('ends execution successfully and emits no output', async () => {
            const { run } = buildController();
            await run([makeCell('')]);

            expect(mockExecution.appendOutput).not.toHaveBeenCalled();
            expect(mockExecution.end).toHaveBeenCalledWith(true, expect.any(Number));
        });

        it('ends execution successfully for whitespace-only content', async () => {
            const { run } = buildController();
            await run([makeCell('   \n  ')]);

            expect(mockExecution.appendOutput).not.toHaveBeenCalled();
            expect(mockExecution.end).toHaveBeenCalledWith(true, expect.any(Number));
        });
    });

    // ─── Successful request ───────────────────────────────────────────────────

    describe('passed entry', () => {
        beforeEach(() => {
            const fileResult = makeFileResult({
                status: 'passed',
                entries: [{
                    name: 'GetUsers',
                    method: 'GET',
                    url: 'https://example.com/users',
                    statusCode: 200,
                    status: 'passed',
                    durationMs: 42,
                    assertions: []
                }]
            });
            const mockRunner = { run: jest.fn().mockResolvedValue(makeRunResult(fileResult)) };
            (createHurlRunner as jest.Mock).mockReturnValue(mockRunner);
        });

        it('appends markdown output', async () => {
            const { run } = buildController();
            await run([makeCell('GET https://example.com/users\nHTTP 200')]);

            expect(mockExecution.appendOutput).toHaveBeenCalled();
            const [arg] = mockExecution.appendOutput.mock.calls[0];
            const outputs: vscode.NotebookCellOutput[] = Array.isArray(arg) ? arg : [arg];
            expect(outputs[0].items[0].mime).toBe('text/markdown');
        });

        it('output contains success icon', async () => {
            const { run } = buildController();
            await run([makeCell('GET https://example.com/users\nHTTP 200')]);

            expect(outputText(mockExecution.appendOutput)).toContain('✅');
        });

        it('output contains the HTTP method and URL', async () => {
            const { run } = buildController();
            await run([makeCell('GET https://example.com/users\nHTTP 200')]);

            const text = outputText(mockExecution.appendOutput);
            expect(text).toContain('GET');
            expect(text).toContain('https://example.com/users');
        });

        it('output contains the status code', async () => {
            const { run } = buildController();
            await run([makeCell('GET https://example.com/users\nHTTP 200')]);

            expect(outputText(mockExecution.appendOutput)).toContain('200');
        });

        it('output contains the entry duration', async () => {
            const { run } = buildController();
            await run([makeCell('GET https://example.com/users\nHTTP 200')]);

            expect(outputText(mockExecution.appendOutput)).toContain('42ms');
        });

        it('ends execution with success=true', async () => {
            const { run } = buildController();
            await run([makeCell('GET https://example.com/users\nHTTP 200')]);

            expect(mockExecution.end).toHaveBeenCalledWith(true, expect.any(Number));
        });
    });

    // ─── Failed request ───────────────────────────────────────────────────────

    describe('failed entry', () => {
        beforeEach(() => {
            const fileResult = makeFileResult({
                status: 'failed',
                entries: [{
                    name: 'CheckStatus',
                    method: 'GET',
                    url: 'https://example.com/check',
                    statusCode: 500,
                    status: 'failed',
                    durationMs: 18,
                    assertions: [],
                    errorMessage: 'status code 500 is not 200'
                }]
            });
            const mockRunner = { run: jest.fn().mockResolvedValue(makeRunResult(fileResult)) };
            (createHurlRunner as jest.Mock).mockReturnValue(mockRunner);
        });

        it('output contains failure icon', async () => {
            const { run } = buildController();
            await run([makeCell('GET https://example.com/check\nHTTP 200')]);

            expect(outputText(mockExecution.appendOutput)).toContain('❌');
        });

        it('output contains the error message from the entry', async () => {
            const { run } = buildController();
            await run([makeCell('GET https://example.com/check\nHTTP 200')]);

            expect(outputText(mockExecution.appendOutput)).toContain('status code 500 is not 200');
        });

        it('ends execution with success=false', async () => {
            const { run } = buildController();
            await run([makeCell('GET https://example.com/check\nHTTP 200')]);

            expect(mockExecution.end).toHaveBeenCalledWith(false, expect.any(Number));
        });
    });

    // ─── Assertion table ─────────────────────────────────────────────────────

    describe('assertion table', () => {
        it('renders a markdown table with the assertion expression, expected and actual', async () => {
            const fileResult = makeFileResult({
                status: 'failed',
                entries: [{
                    name: 'WithAsserts',
                    method: 'GET',
                    url: 'https://example.com',
                    statusCode: 404,
                    status: 'failed',
                    durationMs: 10,
                    assertions: [
                        {
                            filePath: '/tmp/hurl-notebook-test/cell.hurl',
                            expression: 'status',
                            status: 'failed',
                            expected: '200',
                            actual: '404'
                        }
                    ]
                }]
            });
            const mockRunner = { run: jest.fn().mockResolvedValue(makeRunResult(fileResult)) };
            (createHurlRunner as jest.Mock).mockReturnValue(mockRunner);

            const { run } = buildController();
            await run([makeCell('GET https://example.com\nHTTP 200')]);

            const text = outputText(mockExecution.appendOutput);
            expect(text).toContain('Assertions');
            expect(text).toContain('status');
            expect(text).toContain('200');
            expect(text).toContain('404');
        });

        it('marks passing assertions with ✅ and failing ones with ❌', async () => {
            const fileResult = makeFileResult({
                status: 'passed',
                entries: [{
                    name: 'MixedAsserts',
                    method: 'GET',
                    url: 'https://example.com',
                    statusCode: 200,
                    status: 'passed',
                    durationMs: 12,
                    assertions: [
                        {
                            filePath: '/tmp/hurl-notebook-test/cell.hurl',
                            expression: 'status',
                            status: 'passed',
                            expected: '200',
                            actual: '200'
                        },
                        {
                            filePath: '/tmp/hurl-notebook-test/cell.hurl',
                            expression: 'jsonpath "$.id"',
                            status: 'failed',
                            expected: '1',
                            actual: 'null'
                        }
                    ]
                }]
            });
            const mockRunner = { run: jest.fn().mockResolvedValue(makeRunResult(fileResult)) };
            (createHurlRunner as jest.Mock).mockReturnValue(mockRunner);

            const { run } = buildController();
            await run([makeCell('GET https://example.com\nHTTP 200')]);

            const text = outputText(mockExecution.appendOutput);
            expect(text).toContain('✅');
            expect(text).toContain('❌');
        });
    });

    // ─── No entries (error/stderr only) ──────────────────────────────────────

    describe('no entries in file result', () => {
        it('shows error message from fileResult.errorMessage', async () => {
            const fileResult = makeFileResult({
                status: 'error',
                entries: [],
                errorMessage: 'Connection refused'
            });
            const mockRunner = { run: jest.fn().mockResolvedValue(makeRunResult(fileResult)) };
            (createHurlRunner as jest.Mock).mockReturnValue(mockRunner);

            const { run } = buildController();
            await run([makeCell('GET https://example.com\nHTTP 200')]);

            expect(outputText(mockExecution.appendOutput)).toContain('Connection refused');
        });

        it('falls back to stderr when errorMessage is absent', async () => {
            const fileResult = makeFileResult({
                status: 'error',
                entries: [],
                stderr: 'hurl: error: Could not resolve host'
            });
            const mockRunner = { run: jest.fn().mockResolvedValue(makeRunResult(fileResult)) };
            (createHurlRunner as jest.Mock).mockReturnValue(mockRunner);

            const { run } = buildController();
            await run([makeCell('GET https://example.com\nHTTP 200')]);

            expect(outputText(mockExecution.appendOutput)).toContain('Could not resolve host');
        });
    });

    // ─── Runner throws ────────────────────────────────────────────────────────

    describe('runner exception', () => {
        it('appends a notebook error output item', async () => {
            const mockRunner = {
                run: jest.fn().mockRejectedValue(new Error('hurl binary not found'))
            };
            (createHurlRunner as jest.Mock).mockReturnValue(mockRunner);

            const { run } = buildController();
            await run([makeCell('GET https://example.com\nHTTP 200')]);

            const [arg] = mockExecution.appendOutput.mock.calls[0];
            const outputs: vscode.NotebookCellOutput[] = Array.isArray(arg) ? arg : [arg];
            expect(outputs[0].items[0].mime).toBe('application/vnd.code.notebook.error');
        });

        it('ends execution with success=false on runner exception', async () => {
            const mockRunner = {
                run: jest.fn().mockRejectedValue(new Error('unexpected'))
            };
            (createHurlRunner as jest.Mock).mockReturnValue(mockRunner);

            const { run } = buildController();
            await run([makeCell('GET https://example.com\nHTTP 200')]);

            expect(mockExecution.end).toHaveBeenCalledWith(false, expect.any(Number));
        });
    });

    // ─── Temp directory lifecycle ─────────────────────────────────────────────

    describe('temp file management', () => {
        it('writes cell content to a temporary .hurl file before running', async () => {
            const fileResult = makeFileResult({ entries: [] });
            const mockRunner = { run: jest.fn().mockResolvedValue(makeRunResult(fileResult)) };
            (createHurlRunner as jest.Mock).mockReturnValue(mockRunner);

            const { run } = buildController();
            const cellContent = 'GET https://example.com\nHTTP 200';
            await run([makeCell(cellContent)]);

            expect(fsPromises.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('cell.hurl'),
                cellContent,
                'utf-8'
            );
        });

        it('removes the temp directory after successful execution', async () => {
            const fileResult = makeFileResult({ entries: [] });
            const mockRunner = { run: jest.fn().mockResolvedValue(makeRunResult(fileResult)) };
            (createHurlRunner as jest.Mock).mockReturnValue(mockRunner);

            const { run } = buildController();
            await run([makeCell('GET https://example.com\nHTTP 200')]);

            expect(fsPromises.rm).toHaveBeenCalledWith(
                '/tmp/hurl-notebook-test',
                { recursive: true, force: true }
            );
        });

        it('removes the temp directory even when the runner throws', async () => {
            const mockRunner = {
                run: jest.fn().mockRejectedValue(new Error('fail'))
            };
            (createHurlRunner as jest.Mock).mockReturnValue(mockRunner);

            const { run } = buildController();
            await run([makeCell('GET https://example.com\nHTTP 200')]);

            expect(fsPromises.rm).toHaveBeenCalledWith(
                '/tmp/hurl-notebook-test',
                { recursive: true, force: true }
            );
        });
    });

    // ─── Multiple cells ───────────────────────────────────────────────────────

    describe('multiple cells', () => {
        it('executes each cell in sequence', async () => {
            const fileResult = makeFileResult({ entries: [] });
            const mockRunner = { run: jest.fn().mockResolvedValue(makeRunResult(fileResult)) };
            (createHurlRunner as jest.Mock).mockReturnValue(mockRunner);

            // Reset execution mock for a second cell
            let callCount = 0;
            mockNotebookController.createNotebookCellExecution.mockImplementation(() => {
                callCount++;
                return { ...mockExecution, appendOutput: jest.fn().mockResolvedValue(undefined) };
            });

            const { run } = buildController();
            await run([
                makeCell('GET https://example.com/a\nHTTP 200'),
                makeCell('POST https://example.com/b\nHTTP 201')
            ]);

            // createNotebookCellExecution should have been called once per cell
            expect(callCount).toBe(2);
        });
    });
});
