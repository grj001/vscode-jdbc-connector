import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ConnectionSettingsPayload } from './entity/ConnectionSettingsPayload';
import { JavaExecutorUtil } from './util/JavaExecutorUtil';

/**
 * 数据库连接面板
 */
export class ConnectionPanel {
	private static currentPanel: ConnectionPanel | undefined;

	/**
	 * 显示数据库连接面板
	 * @param context 扩展上下文
	 */
	static show(context: vscode.ExtensionContext, connection?: ConnectionSettingsPayload): void {
		if (ConnectionPanel.currentPanel) {
			ConnectionPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'jdbcConnection',
			'数据库连接-' + (connection?.name || '新连接'),
			vscode.ViewColumn.One,
			{ enableScripts: true, retainContextWhenHidden: true }
		);

		ConnectionPanel.currentPanel = new ConnectionPanel(panel, context, connection);
	}

	/**
	 * 构造函数
	 * @param _panel 面板
	 * @param context 扩展上下文
	 */
	private constructor(
		private readonly _panel: vscode.WebviewPanel,
		private readonly _context: vscode.ExtensionContext,
		private readonly _connection?: ConnectionSettingsPayload
	) {
		this._panel.webview.html = this._getHtml();
		// 监听消息
		this._panel.webview.onDidReceiveMessage((message) => {
			// 保存连接
			if (message?.type === 'saveConnection') {
				void this._saveOrUpdateConnection(message.payload as ConnectionSettingsPayload);
			}
			// 测试连接
			if (message?.type === 'testConnection') {
				void this._testConnection(message.payload as ConnectionSettingsPayload);
			}
		}, null, this._context.subscriptions);
		this._panel.onDidDispose(() => {
			ConnectionPanel.currentPanel = undefined;
		}, null, this._context.subscriptions);
	}

	/**
	 * 获取HTML内容
	 * @returns HTML内容
	 */
	private async _saveOrUpdateConnection(payload: ConnectionSettingsPayload): Promise<void> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			vscode.window.showWarningMessage('请先打开一个工作区后再保存连接。');
			return;
		}

		const settingsDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
		const settingsPath = path.join(settingsDir, 'settings.json');
		await fs.promises.mkdir(settingsDir, { recursive: true });

		let currentSettings: Record<string, unknown> = {};
		try {
			const raw = await fs.promises.readFile(settingsPath, 'utf8');
			currentSettings = raw.trim() ? JSON.parse(raw) : {};
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== 'ENOENT') {
				throw error;
			}
		}

		const connections = Array.isArray(currentSettings['vscode-jdbc-connector.connections'])
			? (currentSettings['vscode-jdbc-connector.connections'] as ConnectionSettingsPayload[])
			: [];

		// 查找已存在的连接
		const existingConnection = connections.find((conn) => conn.id === payload.id);
		if (existingConnection) {
			// 更新已存在的连接
			connections[connections.indexOf(existingConnection)] = payload;
		} else {
			// 新增连接
			payload.id = Date.now().toString();
			connections.push(payload);
		}
		currentSettings['vscode-jdbc-connector.connections'] = connections;

		await fs.promises.writeFile(settingsPath, `${JSON.stringify(currentSettings, null, 2)}\n`, 'utf8');

		// 刷新连接树视图
		await vscode.commands.executeCommand('vscode-jdbc-connector.refreshConnections');

		vscode.window.showInformationMessage(`连接已保存到 ${path.relative(workspaceFolder.uri.fsPath, settingsPath)}`);
	}


	/**
	 * 测试数据库连接
	 * @param payload 连接设置
	 */
	private async _testConnection(payload: ConnectionSettingsPayload): Promise<void> {
		if (!payload.jdbcUrl?.trim()) {
			vscode.window.showWarningMessage('请先填写 JDBC URL。');
			return;
		}

		if (!payload.driverPath?.trim()) {
			vscode.window.showWarningMessage('请先填写 JDBC 驱动路径。');
			return;
		}

		// 检查驱动是否存在
		const driverPath = path.resolve(payload.driverPath.trim());
		try {
			await fs.promises.access(driverPath, fs.constants.F_OK);
		} catch {
			vscode.window.showErrorMessage(`JDBC 驱动不存在：${driverPath}`);
			return;
		}

		const driverClassName = this._getDriverClassName(payload.driverType);
		const testMessage = vscode.window.setStatusBarMessage('正在测试 JDBC 连接...');
		try {
			const stdout = await JavaExecutorUtil.runJavaTemplate(
				{
					extensionPath: this._context.extensionPath,
					driverPath: payload.driverPath,
					driverClassName,
					jdbcUrl: payload.jdbcUrl,
					username: payload.username,
					password: payload.password
				},
				'TestJdbcConnection.java',
				'TestJdbcConnection',
				[payload.schema?.trim() ?? ''],
				'连接测试'
			);
			if (stdout === undefined) {
				return;
			}
			const detail = stdout.trim();
			vscode.window.showInformationMessage(detail ? `连接测试成功：${detail}` : '连接测试成功。');
		} finally {
			testMessage.dispose();
		}
	}

	private _getDriverClassName(driverType: string): string {
		switch ((driverType || '').trim().toLowerCase()) {
			case 'mysql':
				return 'com.mysql.cj.jdbc.Driver';
			case 'postgresql':
				return 'org.postgresql.Driver';
			case 'oracle':
				return 'oracle.jdbc.OracleDriver';
			case 'sqlserver':
				return 'com.microsoft.sqlserver.jdbc.SQLServerDriver';
			case 'sqlite':
				return 'org.sqlite.JDBC';
			default:
				return '';
		}
	}

	private _getHtml(): string {
		const htmlPath = path.join(this._context.extensionPath, 'media', 'connectionPanel.html');
		const html = fs.readFileSync(htmlPath, 'utf8');
		const webview = this._panel.webview;
		const mediaPath = vscode.Uri.joinPath(vscode.Uri.file(this._context.extensionPath), 'media');
		const vueJs = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'vue.3.5.40.min.js'));
		const elementPlusJs = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'element-plus.2.14.3.js'));
		const elementPlusCss = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'element-plus.2.14.3.min.css'));
		const initialConnectionJson = JSON.stringify(this._connection ?? null)
			.replace(/\\/g, '\\\\')
			.replace(/'/g, "\\'")
			.replace(/"/g, '\\"');
		return html
			.replace('{{INITIAL_CONNECTION_JSON}}', initialConnectionJson)
			.replace('{{VUE_JS}}', vueJs.toString())
			.replace('{{ELEMENT_PLUS_JS}}', elementPlusJs.toString())
			.replace('{{ELEMENT_PLUS_CSS}}', elementPlusCss.toString());
	}
}
