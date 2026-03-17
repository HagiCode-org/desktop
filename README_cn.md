# Hagicode Desktop

[English](./README.md)

Hagicode Desktop 是在开发者本机上运行和管理 HagiCode Server 的原生控制中心。

## 产品概览

桌面端把 HagiCode 的安装、监控、升级与日常运维整合为一条本地优先的使用路径。

## 核心能力

- 在桌面仪表盘中查看本机资源与服务健康状态
- 不离开应用即可启动、停止和切换嵌入式服务版本
- 在同一界面管理包源、依赖项和许可证信息
- 提供 onboarding、系统托盘、RSS 更新和中英文界面支持
- 支持 Claude Code、Codex、GitHub Copilot CLI 等执行器选择

## 架构速览

- `src/main/` - Electron 主进程服务，负责配置、运行时控制和包管理
- `src/preload/` - 桌面运行时与渲染层 UI 之间的桥接层
- `src/renderer/` - 基于 React 的桌面界面与 Redux 状态管理
- `resources/` - 打包随附的桌面资源
- `docs/` - 开发、签名和存储同步等深入说明

## 本地开发

```bash
npm install
npm run dev
npm run build:prod
```

- `npm run dev` 启动渲染层、监听 Electron 相关进程并以开发模式运行应用
- `npm run build:prod` 执行生产构建，并包含打包前的 smoke test

## 相关文档

- `docs/development.md` - 本地开发说明与更新源配置
- `docs/artifact-signing.md` - Windows 签名配置
- `docs/azure-storage-sync.md` - 后续发布同步说明
