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

import type { HurlEntryResult, HurlAssertionResult } from '@wso2/api-tryit-hurl-runner';

export type { HurlEntryResult, HurlAssertionResult };

// ─── API Request / Response Models ───────────────────────────────────────────

export interface QueryParameter {
    id: string;
    key: string;
    value: string;
}

export interface HeaderParameter {
    id: string;
    key: string;
    value: string;
}

export interface FormDataParameter {
    id: string;
    key: string;
    contentType: string;
    filePath?: string;
    value?: string;
}

export interface FormUrlEncodedParameter {
    id: string;
    key: string;
    value: string;
}

export interface BinaryFileParameter {
    id: string;
    filePath: string;
    contentType: string;
    enabled?: boolean;
}

export interface ResponseHeader {
    key: string;
    value: string;
}

export interface ApiRequest {
    id: string;
    name: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'TRACE';
    url: string;
    queryParameters: QueryParameter[];
    headers: HeaderParameter[];
    body?: string;
    bodyFormData?: FormDataParameter[];
    bodyFormUrlEncoded?: FormUrlEncodedParameter[];
    bodyBinaryFiles?: BinaryFileParameter[];
    assertions?: string[];
}

export interface ApiResponse {
    statusCode: number;
    headers: ResponseHeader[];
    body: string;
}

export interface ApiRequestItem {
    id: string;
    name: string;
    request: ApiRequest;
    response?: ApiResponse;
    assertions?: string[];
    filePath?: string;
}

export interface ApiFolder {
    id: string;
    name: string;
    items: ApiRequestItem[];
    filePath?: string;
}

export interface ApiCollection {
    id: string;
    name: string;
    description?: string;
    folders: ApiFolder[];
    rootItems?: ApiRequestItem[];
}

// ─── Notebook Types ───────────────────────────────────────────────────────────

/** One cell in the notebook — corresponds to one Hurl request block. */
export interface NotebookCellInfo {
    index: number;
    /** Parsed from `# @name` comment, if present. */
    name?: string;
    method?: string;
    url?: string;
    /** Raw Hurl text for this request block. */
    content: string;
}

/** Result returned after executing a single notebook cell. */
export interface NotebookCellResult {
    cellIndex: number;
    status: 'passed' | 'failed' | 'error' | 'skipped';
    durationMs: number;
    entries: HurlEntryResult[];
    assertions: HurlAssertionResult[];
    errorMessage?: string;
    stderr?: string;
    stdout?: string;
}

// ─── RPC contract (vscode-webview-network-bridge) ────────────────────────────

/** Messages sent from the webview to the extension. */
export type HttpBookRequest =
    | { action: 'runNotebookCell'; cellIndex: number; content: string };

/** Messages sent from the extension to the webview (push + RPC response). */
export type HttpBookResponse =
    | { type: 'openNotebook'; title?: string; cells: NotebookCellInfo[] }
    | { type: 'notebookCellResult'; result: NotebookCellResult };
