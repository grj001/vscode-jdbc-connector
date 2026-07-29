import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { promisify } from 'util';
import { execFile } from 'child_process';
import type { ConnectionSettingsPayload } from './ConnectionSettingsPayload';
import { ConnectionTreeItem } from './connectionTreeItem';

const execFileAsync = promisify(execFile);

/**
 * 数据库连接树提供者
 */
export class ConnectionTreeProvider implements vscode.TreeDataProvider<ConnectionTreeItem> {
	private static readonly EXTENSION_ID = 'undefined_publisher.vscode-jdbc-connector';

	private _onDidChangeTreeData = new vscode.EventEmitter<ConnectionTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: ConnectionTreeItem): vscode.TreeItem {
		return element;
	}

	/**
	 * 获取子项
	 * @param element 父项
	 * @returns 子项
	 */
	async getChildren(element?: ConnectionTreeItem): Promise<ConnectionTreeItem[]> {
		if (element?.contextValue === 'connection' && element.connection) {
			return this.getSchemaChildren(element.connection);
		}

		if (element?.contextValue === 'schema' && element.connection) {
			return this.getTableChildren(element.connection, element.schemaName ?? '');
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			return [];
		}

		const settingsPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'settings.json');
		let currentSettings: Record<string, unknown> = {};
		try {
			const raw = fs.readFileSync(settingsPath, 'utf8');
			currentSettings = raw.trim() ? JSON.parse(raw) : {};
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== 'ENOENT') {
				vscode.window.showErrorMessage('读取连接配置失败。');
			}
			return [];
		}

		const connections = Array.isArray(currentSettings['vscode-jdbc-connector.connections'])
			? (currentSettings['vscode-jdbc-connector.connections'] as ConnectionSettingsPayload[])
			: [];

		return connections.map((connection) => new ConnectionTreeItem(
			connection.name,
			vscode.TreeItemCollapsibleState.Collapsed,
			undefined,
			connection,
			'connection'
		));
	}

	/**
	 * 获取模式子项
	 * @param connection 数据库连接
	 * @returns 模式子项
	 */
	private async getSchemaChildren(connection: ConnectionSettingsPayload): Promise<ConnectionTreeItem[]> {
		const stdout = await this.runJavaTemplate(
			connection,
			'ListJdbcSchemas.java',
			'ListJdbcSchemas',
			[],
			`读取 ${connection.name} 的模式`
		);
		if (stdout === undefined) {
			return [];
		}

		const schemaNames = stdout
			.split(/\r?\n/)
			.map(name => name.trim())
			.filter(Boolean);

		if (!schemaNames.length) {
			const defaultSchema = connection.schema?.trim();
			if (!defaultSchema) {
				return [];
			}
			return [new ConnectionTreeItem(defaultSchema, vscode.TreeItemCollapsibleState.Collapsed, undefined, connection, 'schema', defaultSchema)];
		}

		return schemaNames.map(schemaName => new ConnectionTreeItem(
			schemaName,
			vscode.TreeItemCollapsibleState.Collapsed,
			undefined,
			connection,
			'schema',
			schemaName
		));
	}

	/**
	 * 获取数据库表子项
	 * @param connection 数据库连接
	 * @param schemaName 模式名
	 * @returns 数据库表子项
	 */
	private async getTableChildren(connection: ConnectionSettingsPayload, schemaName: string): Promise<ConnectionTreeItem[]> {
		const stdout = await this.runJavaTemplate(
			connection,
			'ListJdbcTables.java',
			'ListJdbcTables',
			[schemaName, connection.database?.trim() ?? ''],
			`读取 ${connection.name} 的数据表`
		);
		if (stdout === undefined) {
			return [];
		}

		return stdout
			.split(/\r?\n/)
			.map(name => name.trim())
			.filter(Boolean)
			.map(name => new ConnectionTreeItem(name, vscode.TreeItemCollapsibleState.None, undefined, undefined, 'table'));
	}

	/**
	 * 执行 Java 模板
	 * @param connection 数据库连接
	 * @param templateFile Java 模板文件
	 * @param className 类名
	 * @param args 额外参数
	 * @param actionName 操作名称
	 * @returns 标准输出
	 */
	private async runJavaTemplate(
		connection: ConnectionSettingsPayload,
		templateFile: string,
		className: string,
		args: string[],
		actionName: string
	): Promise<string | undefined> {
		const driverPath = connection.driverPath?.trim();
		const driverClassName = connection.driverClass?.trim();
		if (!driverPath || !driverClassName) {
			vscode.window.showErrorMessage(`连接 ${connection.name} 缺少驱动路径或驱动类。`);
			return undefined;
		}

		const extension = vscode.extensions.getExtension(ConnectionTreeProvider.EXTENSION_ID)
			?? vscode.extensions.all.find(item => item.packageJSON?.name === 'vscode-jdbc-connector');
		if (!extension) {
			vscode.window.showErrorMessage('未找到扩展资源目录。');
			return undefined;
		}

		const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-jdbc-connector-'));
		const sourcePath = path.join(tempDir, templateFile);
		const templatePath = path.join(extension.extensionPath, 'resources', templateFile);
		const classPath = `${driverPath}${path.delimiter}${tempDir}`;

		try {
			await fs.promises.copyFile(templatePath, sourcePath);
			await execFileAsync('javac', [sourcePath], { cwd: tempDir, timeout: 15000, windowsHide: true });
			const { stdout } = await execFileAsync(
				'java',
				[
					'-Dfile.encoding=UTF-8',
					'-cp',
					classPath,
					className,
					driverClassName,
					connection.jdbcUrl.trim(),
					connection.username?.trim() ?? '',
					connection.password ?? '',
					...args
				],
				{ timeout: 15000, windowsHide: true }
			);
			return stdout;
		} catch (error) {
			const execError = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string; killed?: boolean };
			if (execError.code === 'ENOENT') {
				const commandName = execError.message.includes('javac') ? 'javac' : 'java';
				vscode.window.showErrorMessage(`未找到 ${commandName} 命令，请先安装并配置 Java 开发环境。`);
				return undefined;
			}
			if (execError.killed) {
				vscode.window.showErrorMessage(`${actionName}超时。`);
				return undefined;
			}

			const detail = execError.stderr?.trim() || execError.stdout?.trim() || execError.message;
			vscode.window.showErrorMessage(`${actionName}失败：${detail}`);
			return undefined;
		} finally {
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		}
	}
}
