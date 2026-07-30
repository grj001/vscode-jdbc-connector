import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface QueryExecutionResult {
	columns: string[];
	rows: Array<Array<string | null>>;
	message?: string;
}

/**
 * 查询结果视图
 */
export class QueryResultViewProvider implements vscode.WebviewViewProvider {
	static readonly VIEW_ID = 'jdbcQueryResultView';
	private _view?: vscode.WebviewView;
	private _pendingReveal = false;
	private _connectionName = '';
	private _result: QueryExecutionResult = { columns: [], rows: [], message: '' };
	private readonly _extensionPath: string;

	constructor(extensionPath: string) {
		this._extensionPath = extensionPath;
	}

	resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
		this._view = webviewView;
		this._view.webview.options = { enableScripts: true };
		// 监听消息
		this._view.webview.onDidReceiveMessage((message) => {
			if (message?.type === 'executeQuery') {
				void vscode.commands.executeCommand('vscode-jdbc-connector.executeQuery');
			}
			if (message?.type === 'executeSelectedQuery') {
				void vscode.commands.executeCommand('vscode-jdbc-connector.executeSelectedQuery');
			}
		});
		if (this._pendingReveal) {
			this._pendingReveal = false;
		}
		this._render();
	}

	async reveal(): Promise<void> {
		if (this._view) {
			this._render();
			await vscode.commands.executeCommand('workbench.action.focusPanel');
			return;
		}
		this._pendingReveal = true;
		await vscode.commands.executeCommand('workbench.action.focusPanel');
	}

	showResult(connectionName: string, result: QueryExecutionResult): void {
		this._connectionName = connectionName;
		this._result = result;
		if (!this._view) {
			void this.reveal();
			return;
		}
		this._render();
	}

	showMessage(connectionName: string, message: string): void {
		this._connectionName = connectionName;
		this._result = { columns: [], rows: [], message };
		if (!this._view) {
			void this.reveal();
			return;
		}
		this._render();
	}

	private _render(): void {
		if (!this._view) {
			return;
		}

		const columns = this._result.columns ?? [];
		const rows = this._result.rows ?? [];
		const message = this._escapeHtml(this._result.message ?? '');
		const connectionName = this._escapeHtml(this._connectionName);
		const headerHtml = columns.map(column => `<th>${this._escapeHtml(column)}</th>`).join('');
		const bodyHtml = rows.length
			? rows.map(row => `<tr>${row.map(value => `<td>${this._escapeHtml(value ?? '')}</td>`).join('')}</tr>`).join('')
			: `<tr><td colspan="${Math.max(columns.length, 1)}">暂无结果</td></tr>`;
		const htmlPath = path.join(this._extensionPath, 'media', 'queryResultView.html');
		const html = fs.readFileSync(htmlPath, 'utf8');

		this._view.title = '查询结果';
		this._view.webview.html = html
			.replace('{{CONNECTION_NAME}}', connectionName)
			.replace('{{MESSAGE}}', message)
			.replace('{{HEADER_HTML}}', headerHtml || '<th>结果</th>')
			.replace('{{BODY_HTML}}', bodyHtml);
	}

	private _escapeHtml(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}
}
