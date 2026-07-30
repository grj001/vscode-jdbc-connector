import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { promisify } from 'util';
import { execFile } from 'child_process';
import type { ConnectionSettingsPayload } from './entity/ConnectionSettingsPayload';
import { ConnectionTreeItem } from './entity/connectionTreeItem';

const execFileAsync = promisify(execFile);

/**
 * 数据库连接树提供者
 */
export class ConnectionTreeProvider implements vscode.TreeDataProvider<ConnectionTreeItem> {
	private static readonly EXTENSION_ID = 'undefined_publisher.vscode-jdbc-connector';
	private static readonly PAGE_SIZE = 100;

	private _onDidChangeTreeData = new vscode.EventEmitter<ConnectionTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	// 每个模式的表范围
	private readonly schemaRangeMap = new Map<string, number>();

	refresh(): void {
		this.schemaRangeMap.clear();
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * 加载更多表
	 * @param item 表项
	 */
	loadMoreTables(item: ConnectionTreeItem): void {
		if (item.contextValue !== 'table-more' || !item.connection || !item.catalogName || !item.schemaName) {
			return;
		}

		this.schemaRangeMap.set(this.getSchemaKey(item.connection, item.catalogName, item.schemaName), item.end ?? ConnectionTreeProvider.PAGE_SIZE);
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * 获取树项
	 * @param element 树项
	 * @returns 树项
	 */
	getTreeItem(element: ConnectionTreeItem): vscode.TreeItem {
		if (element.contextValue === 'table-more') {
			element.iconPath = new vscode.ThemeIcon('refresh');
		}
		return element;
	}

	/**
	 * 获取子项
	 * @param element 父项
	 * @returns 子项
	 */
	async getChildren(element?: ConnectionTreeItem): Promise<ConnectionTreeItem[]> {
		if (element?.contextValue === 'connection' && element.connection) {
			return this.getCatalogChildren(element.connection);
		}

		if (element?.contextValue === 'catalog' && element.connection && element.catalogName) {
			return this.getSchemaChildren(element.connection, element.catalogName);
		}

		if (element?.contextValue === 'schema' && element.connection && element.catalogName && element.schemaName) {
			const schemaKey = this.getSchemaKey(element.connection, element.catalogName, element.schemaName);
			const end = this.schemaRangeMap.get(schemaKey) ?? ConnectionTreeProvider.PAGE_SIZE;
			return this.getTableChildren(element.connection, element.catalogName, element.schemaName, 0, end);
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
	 * 获取数据库子项
	 * @param connection 连接
	 * @returns 数据库子项
	 */
	private async getCatalogChildren(connection: ConnectionSettingsPayload): Promise<ConnectionTreeItem[]> {
		const stdout = await this.runJavaTemplate(connection, 'ListJdbcCatalogs.java', 'ListJdbcCatalogs', [], `读取 ${connection.name} 的数据库`);
		if (stdout === undefined) {
			return [];
		}

		const catalogNames = stdout.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
		if (!catalogNames.length) {
			const defaultCatalog = connection.database?.trim();
			if (!defaultCatalog) {
				return [];
			}
			return [new ConnectionTreeItem(defaultCatalog, vscode.TreeItemCollapsibleState.Collapsed, undefined, connection, 'catalog', defaultCatalog)];
		}

		return catalogNames.map(catalogName => new ConnectionTreeItem(
			catalogName,
			vscode.TreeItemCollapsibleState.Collapsed,
			undefined,
			connection,
			'catalog',
			catalogName
		));
	}

	/**
	 * 获取模式子项
	 * @param connection 连接
	 * @param catalogName 数据库名称
	 * @returns 模式子项
	 */
	private async getSchemaChildren(connection: ConnectionSettingsPayload, catalogName: string): Promise<ConnectionTreeItem[]> {
		const stdout = await this.runJavaTemplate(connection, 'ListJdbcSchemas.java', 'ListJdbcSchemas', [catalogName], `读取 ${connection.name} 的模式`);
		if (stdout === undefined) {
			return [];
		}

		const schemaNames = stdout.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
		if (!schemaNames.length) {
			const defaultSchema = connection.schema?.trim();
			if (!defaultSchema) {
				return [];
			}
			return [new ConnectionTreeItem(defaultSchema, vscode.TreeItemCollapsibleState.Collapsed, undefined, connection, 'schema', catalogName, defaultSchema, 0, ConnectionTreeProvider.PAGE_SIZE)];
		}

		return schemaNames.map(schemaName => new ConnectionTreeItem(
			schemaName,
			vscode.TreeItemCollapsibleState.Collapsed,
			undefined,
			connection,
			'schema',
			catalogName,
			schemaName,
			0,
			ConnectionTreeProvider.PAGE_SIZE
		));
	}

	/**
	 * 获取数据表子项
	 * @param connection 连接
	 * @param catalogName 数据库名称
	 * @param schemaName 模式名称
	 * @param begin 开始索引
	 * @param end 结束索引
	 * @returns 数据表子项
	 */
	private async getTableChildren(connection: ConnectionSettingsPayload, catalogName: string, schemaName: string, begin: number, end: number): Promise<ConnectionTreeItem[]> {
		const stdout = await this.runJavaTemplate(connection, 'ListJdbcTables.java', 'ListJdbcTables', [catalogName, schemaName, String(begin), String(end)], `读取 ${connection.name} 的数据表`);
		if (stdout === undefined) {
			return [];
		}

		const tableNames = stdout.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
		const items = tableNames.map(name => new ConnectionTreeItem(name, vscode.TreeItemCollapsibleState.None, undefined, undefined, 'table'));
		if (tableNames.length === end - begin) {
			items.push(new ConnectionTreeItem(
				`查看更多 ${end}-${end + ConnectionTreeProvider.PAGE_SIZE}`,
				vscode.TreeItemCollapsibleState.None,
				{
					command: 'vscode-jdbc-connector.loadMoreTables',
					title: '查看更多',
					arguments: [new ConnectionTreeItem(`查看更多 ${end}-${end + ConnectionTreeProvider.PAGE_SIZE}`, vscode.TreeItemCollapsibleState.None, undefined, connection, 'table-more', catalogName, schemaName, end, end + ConnectionTreeProvider.PAGE_SIZE)]
				},
				connection,
				'table-more',
				catalogName,
				schemaName,
				end,
				end + ConnectionTreeProvider.PAGE_SIZE
			));
		}

		return items;
	}

	/**
	 * 获取模式键
	 * @param connection 连接
	 * @param catalogName 数据库名称
	 * @param schemaName 模式名称
	 * @returns 模式键
	 */
	private getSchemaKey(connection: ConnectionSettingsPayload, catalogName: string, schemaName: string): string {
		return `${connection.id}:${catalogName}:${schemaName}`;
	}

	/**
	 * 运行 Java 模板
	 * @param connection 连接
	 * @param templateFile 模板文件
	 * @param className 类名
	 * @param args 参数
	 * @param actionName 操作名称
	 * @returns 输出
	 */
	private async runJavaTemplate(connection: ConnectionSettingsPayload, templateFile: string, className: string, args: string[], actionName: string): Promise<string | undefined> {
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
			const { stdout } = await execFileAsync('java', ['-Dfile.encoding=UTF-8', '-cp', classPath, className, driverClassName, connection.jdbcUrl.trim(), connection.username?.trim() ?? '', connection.password ?? '', ...args], { timeout: 15000, windowsHide: true });
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
