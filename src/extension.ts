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

	let currentQueryConnection: ConnectionTreeItem | undefined;

	const openConnectionPanel = () => ConnectionPanel.show(context);

	// 打开查询面板
	const openQueryPanel = (item?: ConnectionTreeItem) => {
		const targetItem = item ?? treeView.selection[0] ?? currentQueryConnection;
		if (!targetItem?.connection) {
			vscode.window.showInformationMessage('请先选择一个连接。');
			return;
		}
		currentQueryConnection = targetItem;
		QueryPanel.show(context, targetItem.connection);
	};

	// 新建连接
	const newConnectionCmd = vscode.commands.registerCommand(
		'vscode-jdbc-connector.newConnection',
		openConnectionPanel
	);

	// 新建查询
	const newQueryCmd = vscode.commands.registerCommand(
		'vscode-jdbc-connector.newQuery',
		openQueryPanel
	);

	// 执行查询
	const executeQueryCmd = vscode.commands.registerCommand(
		'vscode-jdbc-connector.executeQuery',
		() => QueryPanel.current?.executeCurrentQuery()
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

	// 加载更多数据库
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

	const selectionDisposable = treeView.onDidChangeSelection((event) => {
		currentQueryConnection = event.selection[0];
	});

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
		selectionDisposable,
		visibilityDisposable,
		newConnectionCmd,
		newQueryCmd,
		executeQueryCmd,
		editConnectionCmd,
		loadMoreTablesCmd,
		refreshCmd
	);
}

export function deactivate() { }
