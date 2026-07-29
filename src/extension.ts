// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ConnectionPanel } from './connectionPanel';
import { ConnectionTreeProvider } from './connectionTreeProvider';

export function activate(context: vscode.ExtensionContext) {
	const treeProvider = new ConnectionTreeProvider();
	const treeView = vscode.window.createTreeView('jdbcConnections', {
		treeDataProvider: treeProvider,
		showCollapseAll: false
	});

	const openConnectionPanel = () => ConnectionPanel.show(context);

	const newConnectionCmd = vscode.commands.registerCommand(
		'vscode-jdbc-connector.newConnection',
		openConnectionPanel
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
		refreshCmd
	);
}

export function deactivate() { }
