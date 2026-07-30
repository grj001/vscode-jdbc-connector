import * as os from 'os';
import * as path from 'path';

/**
 * 路径工具
 */
export class PathUtil {
	/**
	 * 获取 JDBC 临时目录前缀
	 * @returns 临时目录前缀
	 */
	static getJdbcTempDirPrefix(): string {
		return path.join(os.tmpdir(), 'vscode-jdbc-connector-');
	}
}
