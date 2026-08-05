import * as fs from 'fs';
import { PathUtil } from './pathUtil';
import * as JSON5 from 'json5';

/**
 * 数据库缓存信息
 */
export interface ConnectionCacheData {
	catalogs: Array<{
		name: string;
		schemas: Array<{
			name: string;
			tables: string[];
		}>;
	}>;
}

/**
 * 连接缓存工具
 */
export class ConnectionCacheUtil {
	private static readonly CACHE_FILE_NAME = 'jdbc-connection-cache.json';

	/**
	 * 读取连接缓存
	 * @returns 连接缓存
	 */
	static async readCache(): Promise<Record<string, ConnectionCacheData>> {
		const cachePath = ConnectionCacheUtil.getCacheFilePath();
		try {
			const raw = await fs.promises.readFile(cachePath, 'utf8');
			return raw.trim() ? JSON5.parse(raw) as Record<string, ConnectionCacheData> : {};
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === 'ENOENT') {
				return {};
			}
			throw error;
		}
	}

	/**
	 * 读取指定连接缓存
	 * @param connectionId 连接ID
	 * @returns 指定连接缓存
	 */
	static async readConnectionCache(connectionId: string): Promise<ConnectionCacheData | undefined> {
		const cache = await ConnectionCacheUtil.readCache();
		return cache[connectionId];
	}

	/**
	 * 写入指定连接缓存
	 * @param connectionId 连接ID
	 * @param data 缓存数据
	 */
	static async writeConnectionCache(connectionId: string, data: ConnectionCacheData): Promise<void> {
		const cache = await ConnectionCacheUtil.readCache();
		cache[connectionId] = data;
		await ConnectionCacheUtil.writeCache(cache);
	}

	/**
	 * 删除指定连接缓存
	 * @param connectionId 连接ID
	 */
	static async removeConnectionCache(connectionId: string): Promise<void> {
		const cache = await ConnectionCacheUtil.readCache();
		delete cache[connectionId];
		await ConnectionCacheUtil.writeCache(cache);
	}

	/**
	 * 获取缓存文件路径
	 * @returns 缓存文件路径
	 */
	static getCacheFilePath(): string {
		return PathUtil.join(
			PathUtil.getWorkspaceVscodeDir()
			, ConnectionCacheUtil.CACHE_FILE_NAME
		);
	}

	/**
	 * 写入缓存文件
	 * @param cache 缓存对象
	 */
	private static async writeCache(cache: Record<string, ConnectionCacheData>): Promise<void> {
		const vscodeDir = PathUtil.getWorkspaceVscodeDir();
		await fs.promises.mkdir(vscodeDir, { recursive: true });
		await fs.promises.writeFile(
			ConnectionCacheUtil.getCacheFilePath()
			, `${JSON.stringify(cache, null, 2)}\n`
			, 'utf8'
		);
	}
}
