import * as vscode from 'vscode';
import type { ConnectionSettingsPayload } from './ConnectionSettingsPayload';

/**
 * 数据库连接树项
 */
export class ConnectionTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command,
		public readonly connection?: ConnectionSettingsPayload
	) {
		super(label, collapsibleState);
	}
}
