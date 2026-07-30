import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ConnectionSettingsPayload } from './entity/ConnectionSettingsPayload';
import { ConnectionTreeItem } from './entity/connectionTreeItem';
import { JavaExecutorUtil } from './util/JavaExecutorUtil';

/**
 * 数据库连接树提供者
 */
export class ConnectionTreeProvider implements vscode.TreeDataProvider<ConnectionTreeItem> {
	private static readonly EXTENSION_ID = 'undefined_publisher.vscode-jdbc-connector';
	private static readonly PAGE_SIZE = 100;

	constructor(private readonly _context: vscode.ExtensionContext) {
	}

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
		const stdout = await JavaExecutorUtil.runJavaTemplate(
			{
				extensionPath: this._context.extensionPath,
				driverPath: connection.driverPath,
				driverClassName: connection.driverClass,
				jdbcUrl: connection.jdbcUrl,
				username: connection.username,
				password: connection.password
			},
			'ListJdbcCatalogs.java',
			'ListJdbcCatalogs',
			[],
			`读取 ${connection.name} 的数据库`
		);
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
		const stdout = await JavaExecutorUtil.runJavaTemplate(
			{
				extensionPath: this._context.extensionPath,
				driverPath: connection.driverPath,
				driverClassName: connection.driverClass,
				jdbcUrl: connection.jdbcUrl,
				username: connection.username,
				password: connection.password
			},
			'ListJdbcSchemas.java',
			'ListJdbcSchemas',
			[catalogName],
			`读取 ${connection.name} 的模式`
		);
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
		const stdout = await JavaExecutorUtil.runJavaTemplate(
			{
				extensionPath: this._context.extensionPath,
				driverPath: connection.driverPath,
				driverClassName: connection.driverClass,
				jdbcUrl: connection.jdbcUrl,
				username: connection.username,
				password: connection.password
			},
			'ListJdbcTables.java',
			'ListJdbcTables',
			[catalogName, schemaName, String(begin), String(end)],
			`读取 ${connection.name} 的数据表`
		);
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

}
