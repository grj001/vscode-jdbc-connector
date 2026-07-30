import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * 数据库查询面板
 */
export class QueryPanel {
	private static currentPanel: QueryPanel | undefined;

	static show(context: vscode.ExtensionContext, connection?: unknown): void {
		if (QueryPanel.currentPanel) {
			QueryPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'jdbcQuery',
			'SQL 查询',
			vscode.ViewColumn.One,
			{ enableScripts: true, retainContextWhenHidden: true }
		);

		QueryPanel.currentPanel = new QueryPanel(panel, context, connection);
	}

	private constructor(
		private readonly _panel: vscode.WebviewPanel,
		private readonly _context: vscode.ExtensionContext,
		private readonly _connection?: unknown
	) {
		this._panel.webview.html = this._getHtml();
		this._panel.webview.onDidReceiveMessage((message) => {
			if (message?.type === 'executeQuery') {
				void this._executeQuery(message.payload);
			}
		}, null, this._context.subscriptions);
		this._panel.onDidDispose(() => {
			QueryPanel.currentPanel = undefined;
		}, null, this._context.subscriptions);
	}

	private async _executeQuery(payload: { sql?: string; connection?: { driverPath?: string; driverClass?: string; jdbcUrl?: string; username?: string; password?: string; schema?: string } }): Promise<void> {
		const sql = payload.sql?.trim();
		const connection = payload.connection;
		if (!sql || !connection?.jdbcUrl?.trim() || !connection?.driverPath?.trim()) {
			vscode.window.showWarningMessage('请先填写 SQL 和连接信息。');
			return;
		}

		const driverPath = path.resolve(connection.driverPath.trim());
		const tempDir = await fs.promises.mkdtemp(path.join(require('os').tmpdir(), 'vscode-jdbc-query-'));
		const sourcePath = path.join(tempDir, 'ExecuteJdbcQuery.java');
		const templatePath = path.join(this._context.extensionPath, 'resources', 'ExecuteJdbcQuery.java');
		const classPath = `${driverPath}${path.delimiter}${tempDir}`;

		try {
			await fs.promises.copyFile(templatePath, sourcePath);
			const { execFile } = await import('child_process');
			const { promisify } = await import('util');
			const execFileAsync = promisify(execFile);
			await execFileAsync('javac', [sourcePath], { cwd: tempDir, timeout: 15000, windowsHide: true });
			const { stdout } = await execFileAsync('java', ['-Dfile.encoding=UTF-8', '-cp', classPath, 'ExecuteJdbcQuery', connection.driverClass?.trim() ?? '', connection.jdbcUrl.trim(), connection.username?.trim() ?? '', connection.password ?? '', connection.schema?.trim() ?? '', sql], { timeout: 15000, windowsHide: true });
			vscode.window.showInformationMessage(stdout.trim() || '查询执行完成。');
		} catch (error) {
			const execError = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string; killed?: boolean };
			vscode.window.showErrorMessage(execError.stderr?.trim() || execError.stdout?.trim() || execError.message);
		} finally {
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		}
	}

	private _getHtml(): string {
		return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SQL 查询</title></head><body><div id="app"></div></body></html>`;
	}
}
