import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ConnectionSettingsPayload } from './ConnectionSettingsPayload';
import { ConnectionTreeItem } from './connectionTreeItem';

/**
 * 数据库连接树提供者
 */
export class ConnectionTreeProvider implements vscode.TreeDataProvider<ConnectionTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<ConnectionTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: ConnectionTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): ConnectionTreeItem[] {
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
			vscode.TreeItemCollapsibleState.None,
			undefined,
			connection
		));
	}
}
