import * as path from 'path';
import * as vscode from 'vscode';

/**
 * 路径工具
 */
export class PathUtil {

	/**
	 * 获取项目目录
	 * @returns 项目目录
	 */
	static getWorkspacePath(): string {
		let path = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
		if (!path) {
			throw new Error('未找到项目目录。');
		}
		return path;
	}


	/**
	 * 获取 JDBC 临时目录前缀
	 * @returns 临时目录前缀
	 */
	static getJdbcTempDir(): string {
		const workspaceFolder = PathUtil.getWorkspacePath();
		return path.join(workspaceFolder, 'jdbc-temp');
	}

	/**
	 * 获取项目 .vscode 目录
	 * @returns .vscode 目录
	 */
	static getWorkspaceVscodeDir(): string {
		const workspaceFolder = PathUtil.getWorkspacePath();
		return path.join(workspaceFolder, '.vscode');
	}

	/**
	 * 拼接路径
	 * @param paths 路径片段
	 * @returns 路径
	 */
	static join(...paths: string[]): string {
		return path.join(...paths);
	}
}
