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
	private _connectionName = '';
	private _result: QueryExecutionResult = { columns: [], rows: [], message: '' };

	resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
		this._view = webviewView;
		this._view.webview.options = { enableScripts: false };
		this._render();
	}

	showResult(connectionName: string, result: QueryExecutionResult): void {
		this._connectionName = connectionName;
		this._result = result;
		this._render();
	}

	showMessage(connectionName: string, message: string): void {
		this._connectionName = connectionName;
		this._result = { columns: [], rows: [], message };
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

		this._view.title = '查询结果';
		this._view.webview.html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
	<meta charset="UTF-8">
	<title>查询结果</title>
	<style>
		body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 12px; }
		.connection { margin-bottom: 8px; color: var(--vscode-descriptionForeground); }
		.message { margin-bottom: 12px; color: var(--vscode-descriptionForeground); }
		table { width: 100%; border-collapse: collapse; }
		th, td { border: 1px solid var(--vscode-panel-border); padding: 6px 8px; text-align: left; vertical-align: top; }
		th { background: var(--vscode-editorGroupHeader-tabsBackground); }
	</style>
</head>
<body>
	<div class="connection">当前连接：${connectionName}</div>
	<div class="message">${message}</div>
	<table>
		<thead><tr>${headerHtml || '<th>结果</th>'}</tr></thead>
		<tbody>${bodyHtml}</tbody>
	</table>
</body>
</html>`;
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
