import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as JSON5 from 'json5';
import { PathUtil } from './pathUtil';

export class SettingUtil {
    static async getSettings(): Promise<Record<string, unknown>> {
        const workspaceFolder = PathUtil.getWorkspacePath();
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('请先打开一个工作区后再保存连接。');
            return {};
        }

        const settingsDir = path.join(workspaceFolder, '.vscode');
        const settingsPath = path.join(settingsDir, 'settings.json');
        await fs.promises.mkdir(settingsDir, { recursive: true });

        let currentSettings: Record<string, unknown> = {};
        try {
            const raw = await fs.promises.readFile(settingsPath, 'utf8');
            currentSettings = raw.trim() ? JSON5.parse(raw) : {};
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== 'ENOENT') {
                throw error;
            }
        }
        return currentSettings;
    }
}