import * as vscode from 'vscode';

/**
 * 数据库连接树项
 */
export class ConnectionTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command
	) {
		super(label, collapsibleState);
	}
}


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
		return [
			new ConnectionTreeItem(
				'新建连接',
				vscode.TreeItemCollapsibleState.None,
				{
					command: 'vscode-jdbc-connector.newConnection',
					title: '新建连接',
					arguments: []
				}
			)
		];
	}
}
