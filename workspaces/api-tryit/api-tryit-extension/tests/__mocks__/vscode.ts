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

/**
 * Lightweight stub of the `vscode` module for unit tests.
 *
 * Only the surfaces used by the notebook code are implemented. Everything else
 * defaults to jest.fn() so tests can assert calls without needing the VS Code
 * host process.
 */

import { TextEncoder } from 'util';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum NotebookCellKind {
    Markup = 1,
    Code = 2
}

// ─── Notebook data model ─────────────────────────────────────────────────────

export class NotebookCellData {
    kind: NotebookCellKind;
    value: string;
    languageId: string;
    metadata?: Record<string, unknown>;
    outputs?: NotebookCellOutput[];

    constructor(kind: NotebookCellKind, value: string, languageId: string) {
        this.kind = kind;
        this.value = value;
        this.languageId = languageId;
    }
}

export class NotebookData {
    cells: NotebookCellData[];
    constructor(cells: NotebookCellData[]) {
        this.cells = cells;
    }
}

// ─── Cell output ─────────────────────────────────────────────────────────────

export class NotebookCellOutputItem {
    data: Uint8Array;
    mime: string;

    constructor(data: Uint8Array, mime: string) {
        this.data = data;
        this.mime = mime;
    }

    static text(value: string, mime = 'text/plain'): NotebookCellOutputItem {
        return new NotebookCellOutputItem(new TextEncoder().encode(value), mime);
    }

    static error(error: { name: string; message: string; stack?: string }): NotebookCellOutputItem {
        return new NotebookCellOutputItem(
            new TextEncoder().encode(JSON.stringify(error)),
            'application/vnd.code.notebook.error'
        );
    }
}

export class NotebookCellOutput {
    items: NotebookCellOutputItem[];
    constructor(items: NotebookCellOutputItem[]) {
        this.items = items;
    }
}

// ─── Cancellation ─────────────────────────────────────────────────────────────

export const CancellationToken = {
    None: { isCancellationRequested: false, onCancellationRequested: jest.fn() }
};

// ─── VS Code namespace stubs ──────────────────────────────────────────────────

export const notebooks = {
    createNotebookController: jest.fn().mockReturnValue({
        supportedLanguages: [] as string[],
        supportsExecutionOrder: false,
        executeHandler: null as unknown,
        dispose: jest.fn(),
        createNotebookCellExecution: jest.fn()
    })
};

export const workspace = {
    registerNotebookSerializer: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    openNotebookDocument: jest.fn(),
    workspaceFolders: undefined,
    getConfiguration: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue('') }),
    fs: { readFile: jest.fn() }
};

export const window = {
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showOpenDialog: jest.fn(),
    showInputBox: jest.fn(),
    showNotebookDocument: jest.fn()
};

export const Uri = {
    file: jest.fn((p: string) => ({ fsPath: p }))
};

export const commands = {
    registerCommand: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    executeCommand: jest.fn()
};
