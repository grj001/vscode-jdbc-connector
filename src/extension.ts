// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ConnectionPanel } from './connectionPanel';
import { ConnectionTreeItem } from './entity/connectionTreeItem';
import { ConnectionTreeProvider } from './connectionTreeProvider';
import { QueryPanel } from './queryPanel';

export function activate(context: vscode.ExtensionContext) {
	const treeProvider = new ConnectionTreeProvider(context);
	const treeView = vscode.window.createTreeView('jdbcConnections', {
		treeDataProvider: treeProvider,
		showCollapseAll: false
	});

	const openConnectionPanel = () => ConnectionPanel.show(context);
	const openQueryPanel = () => QueryPanel.show(context);

	const newConnectionCmd = vscode.commands.registerCommand(
		'vscode-jdbc-connector.newConnection',
		openConnectionPanel
	);

	const newQueryCmd = vscode.commands.registerCommand(
		'vscode-jdbc-connector.newQuery',
		openQueryPanel
	);

	// 编辑连接
	const editConnectionCmd = vscode.commands.registerCommand(
		'vscode-jdbc-connector.editConnection',
		(item?: ConnectionTreeItem) => {
			const targetItem = item ?? treeView.selection[0];
			if (!targetItem?.connection) {
				vscode.window.showInformationMessage('请先选择一个连接。');
				return;
			}
			ConnectionPanel.show(context, targetItem.connection);
		}
	);

	const loadMoreTablesCmd = vscode.commands.registerCommand(
		'vscode-jdbc-connector.loadMoreTables',
		(item?: ConnectionTreeItem) => {
			const targetItem = item ?? treeView.selection[0];
			if (!targetItem) {
				return;
			}
			treeProvider.loadMoreTables(targetItem);
		}
	);

	const refreshCmd = vscode.commands.registerCommand(
		'vscode-jdbc-connector.refreshConnections',
		() => treeProvider.refresh()
	);

	const visibilityDisposable = treeView.onDidChangeVisibility((event) => {
		if (event.visible) {
			treeProvider.refresh();
		}
	});

	const revealView = () => {
		void vscode.commands.executeCommand('workbench.view.extension.jdbc-connector').then(() => {
			setTimeout(() => {
				treeProvider.refresh();
				void vscode.commands.executeCommand('jdbcConnections.focus');
			}, 200);
		});
	};

	revealView();

	context.subscriptions.push(
		treeView,
		visibilityDisposable,
		newConnectionCmd,
		newQueryCmd,
		editConnectionCmd,
		loadMoreTablesCmd,
		refreshCmd
	);
}

export function deactivate() { }
