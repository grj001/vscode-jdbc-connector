import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * 数据库连接面板
 */
export class ConnectionPanel {
	private static currentPanel: ConnectionPanel | undefined;

	/**
	 * 显示数据库连接面板
	 * @param context 扩展上下文
	 */
	static show(context: vscode.ExtensionContext): void {
		if (ConnectionPanel.currentPanel) {
			ConnectionPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'jdbcConnection',
			'数据库连接',
			vscode.ViewColumn.One,
			{ enableScripts: true, retainContextWhenHidden: true }
		);

		ConnectionPanel.currentPanel = new ConnectionPanel(panel, context);
	}

	/**
	 * 构造函数
	 * @param _panel 面板
	 * @param context 扩展上下文
	 */
	private constructor(
		private readonly _panel: vscode.WebviewPanel,
		private readonly _context: vscode.ExtensionContext
	) {
		this._panel.webview.html = this._getHtml();
		this._panel.onDidDispose(() => {
			ConnectionPanel.currentPanel = undefined;
		}, null, this._context.subscriptions);
	}

	/**
	 * 获取HTML内容
	 * @returns HTML内容
	 */
	private _getHtml(): string {
		const htmlPath = path.join(this._context.extensionPath, 'media', 'connectionPanel.html');
		const html = fs.readFileSync(htmlPath, 'utf8');
		const webview = this._panel.webview;
		const mediaPath = vscode.Uri.joinPath(vscode.Uri.file(this._context.extensionPath), 'media');
		const vueJs = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'vue.3.5.13.min.js'));
		const elementPlusJs = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'element-plus.2.8.8.min.js'));
		const elementPlusCss = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'element-plus.2.8.8.min.css'));
		return html
			.replace('{{VUE_JS}}', vueJs.toString())
			.replace('{{ELEMENT_PLUS_JS}}', elementPlusJs.toString())
			.replace('{{ELEMENT_PLUS_CSS}}', elementPlusCss.toString());
	}
}
