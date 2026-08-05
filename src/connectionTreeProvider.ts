import * as fs from 'fs';
import * as JSON5 from 'json5';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ConnectionSettingsPayload } from './entity/ConnectionSettingsPayload';
import { ConnectionTreeItem } from './entity/connectionTreeItem';
import { ConnectionCacheData, ConnectionCacheUtil } from './util/ConnectionCacheUtil';
import { JavaExecutorUtil } from './util/JavaExecutorUtil';
import { PathUtil } from './util/PathUtil';

/**
 * 数据库连接树提供者
 */
export class ConnectionTreeProvider implements vscode.TreeDataProvider<ConnectionTreeItem> {
	private static readonly EXTENSION_ID = 'undefined_publisher.vscode-jdbc-connector';
	private static readonly PAGE_SIZE = 100;

	constructor(private readonly _context: vscode.ExtensionContext) {
	}

	// 当连接树视图选择项改变时触发
	private _onDidChangeTreeData = new vscode.EventEmitter<ConnectionTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	// 每个模式的表范围
	private readonly schemaRangeMap = new Map<string, number>();
	private readonly connectionCacheMap = new Map<string, ConnectionCacheData>();
	private _currentSelection?: ConnectionTreeItem;

	refresh(): void {
		this.schemaRangeMap.clear();
		this.connectionCacheMap.clear();
		const connectionId = this._currentSelection?.connection?.id;
		if (connectionId) {
			void ConnectionCacheUtil.removeConnectionCache(connectionId);
		}
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * 设置当前选中项
	 * @param item 当前选中项
	 */
	setSelection(item?: ConnectionTreeItem): void {
		this._currentSelection = item;
	}

	/**
	 * 加载更多表
	 * @param item 表项
	 */
	loadMoreTables(item: ConnectionTreeItem): void {
		if (item.contextValue !== 'table-more' || !item.connection || !item.catalogName || !item.schemaName) {
			return;
		}

		// 更新缓存范围
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
			return this.getTableChildren(
				element.connection
				, element.catalogName
				, element.schemaName
				, 0
				, end
			);
		}

		const workspaceFolder = PathUtil.getWorkspacePath();
		if (!workspaceFolder) {
			return [];
		}

		const settingsPath = path.join(workspaceFolder, '.vscode', 'settings.json');
		let currentSettings: Record<string, unknown> = {};
		try {
			// 判断文件是否存在
			if (!fs.existsSync(settingsPath)) {
				return [];
			}
			const raw = fs.readFileSync(settingsPath, 'utf8');
			currentSettings = raw.trim() ? JSON5.parse(raw) : {};
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			const message = (error as NodeJS.ErrnoException).message;
			if (code !== 'ENOENT') {
				vscode.window.showErrorMessage(`读取连接配置失败。${message}`);
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
		// 从缓存中获取数据库列表
		const cachedConnectionData = await this.getOrLoadConnectionCache(connection);
		// 如果缓存中存在数据库列表, 则直接返回
		const cachedCatalogs = cachedConnectionData?.catalogs ?? [];
		if (cachedCatalogs.length) {
			return cachedCatalogs.map(catalog => new ConnectionTreeItem(
				catalog.name,
				vscode.TreeItemCollapsibleState.Collapsed,
				undefined,
				connection,
				'catalog',
				catalog.name,
				undefined,
				undefined,
				undefined,
				undefined,
			));
		}

		const stdout = await JavaExecutorUtil.runJavaTemplate(
			{
				extensionPath: this._context.extensionPath,
				workspacePath: PathUtil.getWorkspacePath(),
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
		if (catalogNames.length) {
			await this.saveCatalogCache(connection, catalogNames);
		}
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
		const cachedConnectionData = await this.getOrLoadConnectionCache(connection);
		const cachedCatalog = cachedConnectionData?.catalogs.find(catalog => catalog.name === catalogName);
		if (cachedCatalog?.schemas.length) {
			return cachedCatalog.schemas.map(schema => new ConnectionTreeItem(
				schema.name,
				vscode.TreeItemCollapsibleState.Collapsed,
				undefined,
				connection,
				'schema',
				catalogName,
				schema.name,
				undefined,
				0,
				ConnectionTreeProvider.PAGE_SIZE
			));
		}

		const stdout = await JavaExecutorUtil.runJavaTemplate(
			{
				extensionPath: this._context.extensionPath,
				workspacePath: PathUtil.getWorkspacePath(),
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
		if (schemaNames.length) {
			await this.saveSchemaCache(connection, catalogName, schemaNames);
		}
		if (!schemaNames.length) {
			const defaultSchema = connection.schema?.trim();
			if (!defaultSchema) {
				return [];
			}
			return [new ConnectionTreeItem(defaultSchema, vscode.TreeItemCollapsibleState.Collapsed, undefined, connection, 'schema', catalogName, defaultSchema, undefined, 0, ConnectionTreeProvider.PAGE_SIZE)];
		}

		return schemaNames.map(schemaName => new ConnectionTreeItem(
			schemaName,
			vscode.TreeItemCollapsibleState.Collapsed,
			undefined,
			connection,
			'schema',
			catalogName,
			schemaName,
			undefined,
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
	private async getTableChildren(
		connection: ConnectionSettingsPayload
		, catalogName: string
		, schemaName: string
		, begin: number
		, end: number
	): Promise<ConnectionTreeItem[]> {

		// 从缓存中获取
		const cachedConnectionData = await this.getOrLoadConnectionCache(connection);
		const cachedSchema = cachedConnectionData?.catalogs
			.find(catalog => catalog.name === catalogName)
			?.schemas.find(schema => schema.name === schemaName);
		if (cachedSchema?.tables.length) {
			return this.createTableItems(
				connection
				, catalogName
				, schemaName
				, cachedSchema.tables
				, begin
				, end
				, cachedSchema.tables.length > end
			);
		}

		// 从数据库读取
		const stdout = await JavaExecutorUtil.runJavaTemplate(
			{
				extensionPath: this._context.extensionPath,
				workspacePath: PathUtil.getWorkspacePath(),
				driverPath: connection.driverPath,
				driverClassName: connection.driverClass,
				jdbcUrl: connection.jdbcUrl,
				username: connection.username,
				password: connection.password
			},
			'ListJdbcTables.java',
			'ListJdbcTables',
			[catalogName, schemaName],
			`读取 ${connection.name} 的数据表`
		);
		if (stdout === undefined) {
			return [];
		}

		const tableNames = stdout.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
		if (tableNames.length) {
			await this.saveTableCache(connection, catalogName, schemaName, begin, tableNames);
		}
		return this.createTableItems(
			connection
			, catalogName
			, schemaName
			, tableNames
			, begin
			, end
			, tableNames.length > end
		);
	}

	/**
	 * 获取模式键
	 * @param connection 连接
	 * @param catalogName 数据库名称
	 * @param schemaName 模式名称
	 * @returns 模式键
	 */
	private getSchemaKey(
		connection: ConnectionSettingsPayload
		, catalogName: string
		, schemaName: string
	): string {
		return `${connection.id}:${catalogName}:${schemaName}`;
	}

	// #region 缓存处理
	/**
	 * 获取或加载连接缓存
	 * @param connection 连接
	 * @returns 连接缓存数据
	 */
	private async getOrLoadConnectionCache(connection: ConnectionSettingsPayload): Promise<ConnectionCacheData | undefined> {
		const cacheKey = connection.id;
		// 从内存缓存中获取
		const memoryCache = this.connectionCacheMap.get(cacheKey);
		if (memoryCache) {
			return memoryCache;
		}
		// 从文件读取缓存
		const fileCache = await ConnectionCacheUtil.readConnectionCache(cacheKey);
		if (fileCache) {
			this.connectionCacheMap.set(cacheKey, fileCache);
		}
		return fileCache;
	}

	private async saveCatalogCache(connection: ConnectionSettingsPayload, catalogNames: string[]): Promise<void> {
		const connectionCacheData = await this.getOrLoadConnectionCache(connection) ?? { catalogs: [] };
		connectionCacheData.catalogs = catalogNames.map(name => ({ name, schemas: [] }));
		this.connectionCacheMap.set(connection.id, connectionCacheData);
		await ConnectionCacheUtil.writeConnectionCache(connection.id, connectionCacheData);
	}

	private async saveSchemaCache(connection: ConnectionSettingsPayload, catalogName: string, schemaNames: string[]): Promise<void> {
		const connectionCacheData = await this.getOrLoadConnectionCache(connection) ?? { catalogs: [] };
		const catalog = this.getOrCreateCatalogCache(connectionCacheData, catalogName);
		catalog.schemas = schemaNames.map(name => ({ name, tables: [] }));
		this.connectionCacheMap.set(connection.id, connectionCacheData);
		await ConnectionCacheUtil.writeConnectionCache(connection.id, connectionCacheData);
	}

	private async saveTableCache(connection: ConnectionSettingsPayload, catalogName: string, schemaName: string, begin: number, tableNames: string[]): Promise<void> {
		const connectionCacheData = await this.getOrLoadConnectionCache(connection) ?? { catalogs: [] };
		const catalog = this.getOrCreateCatalogCache(connectionCacheData, catalogName);
		const schema = this.getOrCreateSchemaCache(catalog, schemaName);
		if (begin === 0) {
			schema.tables = [...tableNames];
		} else {
			const nextTables = [...schema.tables];
			nextTables.splice(begin, tableNames.length, ...tableNames);
			schema.tables = nextTables;
		}
		this.connectionCacheMap.set(connection.id, connectionCacheData);
		await ConnectionCacheUtil.writeConnectionCache(connection.id, connectionCacheData);
	}

	private getOrCreateCatalogCache(connectionCacheData: ConnectionCacheData, catalogName: string): ConnectionCacheData['catalogs'][number] {
		let catalog = connectionCacheData.catalogs.find(item => item.name === catalogName);
		if (catalog) {
			return catalog;
		}
		catalog = { name: catalogName, schemas: [] };
		connectionCacheData.catalogs.push(catalog);
		return catalog;
	}

	private getOrCreateSchemaCache(catalog: ConnectionCacheData['catalogs'][number], schemaName: string): ConnectionCacheData['catalogs'][number]['schemas'][number] {
		let schema = catalog.schemas.find(item => item.name === schemaName);
		if (schema) {
			return schema;
		}
		schema = { name: schemaName, tables: [] };
		catalog.schemas.push(schema);
		return schema;
	}

	
	// #endregion


	/**
	 * 创建表项
	 * @param connection 连接
	 * @param catalogName 数据库名称
	 * @param schemaName 模式名称
	 * @param tableNames 表名列表
	 * @param begin 开始索引
	 * @param end 结束索引
	 * @param hasMore 是否还有更多表
	 * @returns 表项列表
	 */
	private createTableItems(
		connection: ConnectionSettingsPayload
		, catalogName: string
		, schemaName: string
		, tableNames: string[]
		, begin: number
		, end: number
		, hasMore: boolean
	): ConnectionTreeItem[] {
		// 创建表项
		const items = tableNames.slice(begin, end).map(name => new ConnectionTreeItem(
			name
			, vscode.TreeItemCollapsibleState.None
			, undefined
			, connection
			, 'table'
			, catalogName
			, schemaName
			, name
			, begin
			, end
		));
		// 创建查看更多项
		if (hasMore) {
			items.push(new ConnectionTreeItem(
				`查看更多 ${end}-${end + ConnectionTreeProvider.PAGE_SIZE}`,
				vscode.TreeItemCollapsibleState.None,
				{
					command: 'vscode-jdbc-connector.loadMoreTables',
					title: '查看更多',
					arguments: [new ConnectionTreeItem(
						`查看更多 ${end}-${end + ConnectionTreeProvider.PAGE_SIZE}`
						, vscode.TreeItemCollapsibleState.None
						, undefined
						, connection, 'table-more'
						, catalogName
						, schemaName
						, undefined
						, end
						, end + ConnectionTreeProvider.PAGE_SIZE
					)]
				},
				connection,
				'table-more',
				catalogName,
				schemaName,
				undefined,
				end,
				end + ConnectionTreeProvider.PAGE_SIZE
			));
		}
		return items;
	}

}
