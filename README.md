# JDBC Connector

一个用于在 VS Code 中管理数据库 JDBC 连接的扩展。

## 功能

- 在侧边栏中显示 JDBC 连接视图
- 创建新的数据库连接入口
- 打开 JDBC 连接配置面板
- 支持后续扩展为连接、查询、管理数据库

## 当前界面

扩展目前提供一个 JDBC 连接配置页面，包含：

- 连接名称
- JDBC URL
- 驱动类型
- 驱动地址
- 主机地址
- 端口
- 数据库名
- 用户名
- 密码

## 安装

1. 克隆项目到本地
2. 执行依赖安装

```bash
npm install
```

3. 编译项目

```bash
npm run compile
```

4. 在 VS Code 中按 `F5` 启动调试扩展

## 使用方式

- 打开 VS Code 左侧活动栏中的 `JDBC Connector`
- 点击 `新建连接`
- 在弹出的面板中填写 JDBC 连接信息



## 项目结构

- `src/extension.ts`：扩展入口
- `src/connectionPanel.ts`：Webview 面板逻辑
- `src/connectionTreeProvider.ts`：左侧树视图数据提供
- `media/connectionPanel.html`：JDBC 连接配置页面

## 许可证

MIT

