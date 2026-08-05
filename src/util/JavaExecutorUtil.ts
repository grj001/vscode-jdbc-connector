import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import * as vscode from 'vscode';
import { PathUtil } from './pathUtil';

const execFileAsync = promisify(execFile);

/**
 * Java 执行上下文
 */
export interface JavaExecutionContext {
	readonly extensionPath: string;
	readonly workspacePath: string;
	readonly driverPath: string;
	readonly driverClassName: string;
	readonly jdbcUrl: string;
	readonly username?: string;
	readonly password?: string;
}

/**
 * Java 执行工具
 */
export class JavaExecutorUtil {
	/**
	 * 执行 Java 模板
	 * @param context 执行上下文
	 * @param templateFile 模板文件
	 * @param className 类名
	 * @param args 参数
	 * @param actionName 操作名称
	 * @returns 输出
	 */
	static async runJavaTemplate(
		context: JavaExecutionContext,
		templateFile: string,
		className: string,
		args: string[],
		actionName: string
	): Promise<string | undefined> {
		const driverPath = context.driverPath.trim();
		const driverClassName = context.driverClassName.trim();
		if (!driverPath || !driverClassName) {
			vscode.window.showErrorMessage('连接缺少驱动路径或驱动类。');
			return undefined;
		}

		const tempDir = await PathUtil.getJdbcTempDir();
		const sourcePath = path.join(tempDir, templateFile);
		const templatePath = path.join(context.extensionPath, 'resources', templateFile);
		const classPath = `${driverPath}${path.delimiter}${tempDir}`;

		try {
			await fs.promises.copyFile(templatePath, sourcePath);
			await execFileAsync(
				'javac',
				['-encoding', 'UTF-8', sourcePath],
				{ cwd: tempDir, timeout: 15000, windowsHide: true }
			);
			const { stdout } = await execFileAsync(
				'java',
				[
					'-Dfile.encoding=UTF-8',
					'-cp',
					classPath,
					className,
					driverClassName,
					context.jdbcUrl.trim(),
					context.username?.trim() ?? '',
					context.password ?? '',
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
			
		}
	}
}
