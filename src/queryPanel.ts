import * as fs from 'fs';
import * as vscode from 'vscode';
import type { ConnectionSettingsPayload } from './entity/ConnectionSettingsPayload';
import { JavaExecutorUtil } from './util/JavaExecutorUtil';
import { PathUtil } from './util/PathUtil';

interface QueryExecutionResult {
	columns: string[];
	rows: Array<Array<string | null>>;
	message?: string;
}

/**
 * 数据库查询面板
 */
export class QueryPanel {
	private static readonly SQL_LANGUAGE_ID = 'sql';
	private static currentPanel: QueryPanel | undefined;

	static get current(): QueryPanel | undefined {
		return QueryPanel.currentPanel;
	}

	private _queryDocument?: vscode.TextDocument;
	private _queryEditor?: vscode.TextEditor;
	private _resultPanel?: vscode.WebviewPanel;
	private _queryFilePath?: string;

	static show(context: vscode.ExtensionContext, connection?: ConnectionSettingsPayload): void {
		if (!connection) {
			vscode.window.showInformationMessage('请先选择一个连接。');
			return;
		}

		if (QueryPanel.currentPanel) {
			void QueryPanel.currentPanel._reveal(connection);
			return;
		}

		QueryPanel.currentPanel = new QueryPanel(context, connection);
		void QueryPanel.currentPanel._show();
	}

	private constructor(
		private readonly _context: vscode.ExtensionContext,
		private _connection: ConnectionSettingsPayload
	) {
	}

	// #region 面板显示
	private async _show(): Promise<void> {
		await this._openQueryEditor();
		this._ensureResultPanel();
		this._registerEditorListener();
	}

	/**
	 * 显示查询面板
	 * @param connection 连接
	 */
	private async _reveal(connection: ConnectionSettingsPayload): Promise<void> {
		this._connection = connection;
		await this._openQueryEditor();
		this._ensureResultPanel();
		this._updateResultHtml({ columns: [], rows: [], message: `当前连接：${this._connection.name}` });
	}

	// 打开查询编辑器
	private async _openQueryEditor(): Promise<void> {
		const queryFilePath = await this._ensureQueryFilePath();
		const document = await vscode.workspace.openTextDocument(queryFilePath);
		this._queryDocument = document;
		this._queryFilePath = queryFilePath;
		this._queryEditor = await vscode.window.showTextDocument(
			document,
			{ preview: false, viewColumn: vscode.ViewColumn.One }
		);
		await vscode.languages.setTextDocumentLanguage(document, QueryPanel.SQL_LANGUAGE_ID);
		await this._ensureExecuteButton(document);
		if (!document.getText().trim()) {
			const edit = new vscode.WorkspaceEdit();
			edit.insert(document.uri, new vscode.Position(0, 0), '-- 输入 SQL 后点击右上角执行查询\n');
			await vscode.workspace.applyEdit(edit);
		}
	}

	private async _ensureQueryFilePath(): Promise<string> {
		if (this._queryFilePath) {
			return this._queryFilePath;
		}

		const workspaceFolder = PathUtil.getWorkspacePath();
		if (!workspaceFolder) {
			throw new Error('未找到项目目录。');
		}

		const queryDir = PathUtil.getJdbcTempDir();
		await fs.promises.mkdir(queryDir, { recursive: true });
		const safeFileName = this._connection.name.replace(/[\\/:*?"<>|]/g, '_');
		const queryFilePath = PathUtil.join(queryDir, `${safeFileName}.sql`);
		await fs.promises.writeFile(queryFilePath, '', 'utf8');
		this._queryFilePath = queryFilePath;
		return queryFilePath;
	}

	private _ensureResultPanel(): void {
		if (this._resultPanel) {
			this._resultPanel.reveal(vscode.ViewColumn.Two);
			return;
		}

		this._resultPanel = vscode.window.createWebviewPanel(
			'jdbcQueryResult',
			`查询结果 - ${this._connection.name}`,
			vscode.ViewColumn.Two,
			{ enableScripts: false, retainContextWhenHidden: true }
		);
		this._resultPanel.onDidDispose(() => {
			this._resultPanel = undefined;
			this._queryDocument = undefined;
			this._queryEditor = undefined;
			void this._deleteQueryFile();
			QueryPanel.currentPanel = undefined;
		}, null, this._context.subscriptions);
		this._updateResultHtml({ columns: [], rows: [], message: `当前连接：${this._connection.name}` });
	}

	private _registerEditorListener(): void {
		const disposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (editor?.document.languageId === QueryPanel.SQL_LANGUAGE_ID && editor.document.uri.fsPath === this._queryFilePath) {
				this._queryEditor = editor;
			}
		});
		this._context.subscriptions.push(disposable);
	}
	// #endregion

	// #region 执行查询
	private async _ensureExecuteButton(document: vscode.TextDocument): Promise<void> {
		await vscode.commands.executeCommand('setContext', 'jdbcQueryEditor', document.uri.fsPath === this._queryFilePath);
	}

	async executeCurrentQuery(): Promise<void> {
		const editor = this._queryEditor ?? vscode.window.activeTextEditor;
		if (!editor || editor.document.uri.fsPath !== this._queryFilePath) {
			vscode.window.showInformationMessage('请先打开 SQL 查询编辑器。');
			return;
		}

		const selectedSql = editor.selection.isEmpty ? '' : editor.document.getText(editor.selection).trim();
		const sql = selectedSql || editor.document.getText().trim();
		if (!sql) {
			vscode.window.showWarningMessage('请输入 SQL。');
			return;
		}

		const statusBar = vscode.window.setStatusBarMessage('正在执行 SQL 查询...');
		try {
			const stdout = await JavaExecutorUtil.runJavaTemplate(
				{
					extensionPath: this._context.extensionPath,
					workspacePath: PathUtil.getWorkspacePath(),
					driverPath: this._connection.driverPath,
					driverClassName: this._connection.driverClass,
					jdbcUrl: this._connection.jdbcUrl,
					username: this._connection.username,
					password: this._connection.password
				},
				'ExecuteJdbcQuery.java',
				'ExecuteJdbcQuery',
				[this._connection.schema?.trim() ?? '', sql],
				'执行 SQL 查询'
			);
			if (stdout === undefined) {
				return;
			}

			const result = JSON.parse(stdout.trim()) as QueryExecutionResult;
			this._ensureResultPanel();
			this._updateResultHtml(result);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`解析查询结果失败：${detail}`);
		} finally {
			statusBar.dispose();
		}
	}
	// #endregion

	// #region 结果展示
	private _updateResultHtml(result: QueryExecutionResult): void {
		if (!this._resultPanel) {
			return;
		}

		const columns = result.columns ?? [];
		const rows = result.rows ?? [];
		const message = this._escapeHtml(result.message ?? '');
		const headerHtml = columns.map(column => `<th>${this._escapeHtml(column)}</th>`).join('');
		const bodyHtml = rows.length
			? rows.map(row => `<tr>${row.map(value => `<td>${this._escapeHtml(value ?? '')}</td>`).join('')}</tr>`).join('')
			: `<tr><td colspan="${Math.max(columns.length, 1)}">暂无结果</td></tr>`;

		this._resultPanel.title = `查询结果 - ${this._connection.name}`;
		this._resultPanel.webview.html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
	<meta charset="UTF-8">
	<title>查询结果</title>
	<style>
		body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 12px; }
		.message { margin-bottom: 12px; color: var(--vscode-descriptionForeground); }
		table { width: 100%; border-collapse: collapse; }
		th, td { border: 1px solid var(--vscode-panel-border); padding: 6px 8px; text-align: left; vertical-align: top; }
		th { background: var(--vscode-editorGroupHeader-tabsBackground); }
	</style>
</head>
<body>
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

	private async _deleteQueryFile(): Promise<void> {
		if (!this._queryFilePath) {
			return;
		}

		try {
			await fs.promises.rm(this._queryFilePath, { force: true });
		} catch {
			// 临时查询文件删除失败时忽略
		} finally {
			this._queryFilePath = undefined;
		}
	}
	// #endregion
}
