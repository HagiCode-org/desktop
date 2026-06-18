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

## Microsoft Store 许可证支持

`Hagicode 赞助者计划` 和新的 `TurboEngine` 工作区都会作为一级入口长期显示在侧边栏中。只有当 Desktop 解析为 `win-store` 运行模式时，才会注册 Microsoft Store 许可证查询、购买桥接、IPC 处理器和自动刷新逻辑；源码模式、便携模式和其他非 Store 渠道仍会显示页面，但会退回到 Microsoft Store 引导界面。

TurboEngine 对应的 Microsoft Store ID 是 `9NSD809W18Z6`。Desktop 会在启动时对这个永久许可证做实时校验，而不是把本地缓存当作最终真值；如果当前运行时不是 Microsoft Store 版本，就会改为提示用户前往 Microsoft Store 页面完成购买和验证。

如果要验证 TurboEngine 购买流程，必须在打包后的 Microsoft Store / MSIX 运行时里检查 `9NSD809W18Z6` 的启动校验、手动刷新、购买成功、已拥有、取消购买，以及非 Store 运行时引导这些分支。

## 相关文档

- `docs/development.md` - 本地开发说明与更新源配置
- `docs/artifact-signing.md` - Windows 签名配置
- `docs/azure-storage-sync.md` - 后续发布同步说明
