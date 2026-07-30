import * as fs from 'fs';
import * as vscode from 'vscode';
import type { ConnectionSettingsPayload } from './entity/ConnectionSettingsPayload';
import { QueryResultViewProvider } from './queryResultViewProvider';
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
	private static resultViewProvider?: QueryResultViewProvider;

	static get current(): QueryPanel | undefined {
		return QueryPanel.currentPanel;
	}

	static setResultViewProvider(provider: QueryResultViewProvider): void {
		QueryPanel.resultViewProvider = provider;
	}

	private _queryDocument?: vscode.TextDocument;
	private _queryEditor?: vscode.TextEditor;
	private _queryFilePath?: string;

	/**
	 * 显示查询面板
	 * @param context 扩展上下文
	 * @param connection 连接
	 */
	static show(context: vscode.ExtensionContext, connection?: ConnectionSettingsPayload): void {
		if (!connection) {
			vscode.window.showInformationMessage('请先选择一个连接。');
			return;
		}

		// 显示查询面板
		if (QueryPanel.currentPanel) {
			void QueryPanel.currentPanel._reveal(connection);
			return;
		}

		// 创建查询面板
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
		this._showResultMessage(`当前连接：${this._connection.name}`);
		this._registerEditorListener();
	}

	/**
	 * 显示查询面板
	 * @param connection 连接
	 */
	private async _reveal(connection: ConnectionSettingsPayload): Promise<void> {
		this._connection = connection;
		await this._openQueryEditor();
		this._showResultMessage(`当前连接：${this._connection.name}`);
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

	/**
	 * 确保查询文件路径存在
	 * @returns 查询文件路径
	 */
	private async _ensureQueryFilePath(): Promise<string> {
		const queryDir = await PathUtil.getJdbcTempDir();
		await fs.promises.mkdir(queryDir, { recursive: true });
		const safeFileName = this._connection.name.replace(/[\\/:*?"<>|]/g, '_');
		const queryFilePath = PathUtil.join(queryDir, `${safeFileName}.sql`);
		if (!this._queryFilePath || this._queryFilePath !== queryFilePath) {
			this._queryFilePath = queryFilePath;
		}
		try {
			await fs.promises.access(queryFilePath, fs.constants.F_OK);
			return queryFilePath;
		} catch {
			await fs.promises.writeFile(queryFilePath, '', 'utf8');
			return queryFilePath;
		}
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

	/**
	 * 执行当前查询
	 */
	async executeCurrentQuery(): Promise<void> {
		return this._executeQuery(false);
	}

	/**
	 * 执行选中查询
	 */
	async executeSelectedQuery(): Promise<void> {
		return this._executeQuery(true);
	}

	/**
	 * 执行查询
	 * @param onlySelection 是否仅执行选中 SQL
	 */
	private async _executeQuery(onlySelection: boolean): Promise<void> {
		const editor = this._queryEditor ?? vscode.window.activeTextEditor;
		if (!editor || editor.document.uri.fsPath !== this._queryFilePath) {
			vscode.window.showInformationMessage('请先打开 SQL 查询编辑器。');
			return;
		}

		const selectedSql = editor.selection.isEmpty ? '' : editor.document.getText(editor.selection).trim();
		const sql = onlySelection ? selectedSql : (selectedSql || editor.document.getText().trim());
		if (!sql) {
			vscode.window.showWarningMessage(onlySelection ? '请先选中要执行的 SQL。' : '请输入 SQL。');
			return;
		}

		const schema = this._connection.schema?.trim() ?? '';
		const database = this._connection.database?.trim() ?? '';
		const execArgs = database ? [database, schema, sql] : [schema, sql];
		const statusBar = vscode.window.setStatusBarMessage(onlySelection ? '正在执行已选中 SQL...' : '正在执行 SQL 查询...');
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
				execArgs,
				onlySelection ? '执行已选中 SQL' : '执行 SQL 查询'
			);
			if (stdout === undefined) {
				return;
			}

			const result = JSON.parse(stdout.trim()) as QueryExecutionResult;
			this._showResult(result);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`解析查询结果失败：${detail}`);
		} finally {
			statusBar.dispose();
		}
	}

	// #endregion

	// #region 结果展示
	private _showResult(result: QueryExecutionResult): void {
		QueryPanel.resultViewProvider?.showResult(this._connection.name, result);
	}

	private _showResultMessage(message: string): void {
		QueryPanel.resultViewProvider?.showMessage(this._connection.name, message);
	}
	// #endregion

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
}
