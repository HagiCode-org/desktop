# Hagicode Desktop

English | [简体中文](./README.zh-CN.md)

> Hagicode Server 管理与监控桌面客户端

## 简介

Hagicode Desktop 是一款基于 Electron、React 和 TypeScript 构建的现代化桌面应用程序。它为管理和监控 Hagicode Server 提供了友好的用户界面，包含版本管理、依赖处理和 Web 服务控制等功能。

## 功能特性

- **系统管理**: 监控和管理系统资源与服务
- **Web 服务控制**: 轻松启动、停止和重启嵌入式 Web 服务
- **版本管理**: 安装、切换和管理多个 Web 服务版本
- **依赖管理**: 自动检测和安装所需的依赖项
- **多语言支持**: 内置国际化支持，支持英文和中文
- **现代化界面**: 使用 shadcn/ui 组件构建的美观、响应式界面
- **托盘集成**: 系统托盘支持，快速访问控制功能
- **深色模式**: 支持浅色/深色主题切换

## 技术栈

- **框架**: Electron
- **UI**: React 19, TypeScript
- **样式**: Tailwind CSS 4
- **组件**: shadcn/ui, Radix UI
- **状态管理**: Redux Toolkit, Redux Saga
- **国际化**: i18next, react-i18next

## 环境要求

- Node.js 18+
- npm 或 yarn

## 安装

```bash
# 克隆仓库
git clone https://github.com/HagiCode-org/desktop.git
cd desktop

# 安装依赖
npm install
```

## 开发

```bash
# 启动开发模式（运行渲染进程开发服务器，以监听模式编译主进程和预加载脚本，并启动 Electron）
npm run dev
```

## 构建

```bash
# 构建生产版本
npm run build:prod

# 构建特定平台的分发版本
npm run build:win      # Windows
npm run build:mac      # macOS
npm run build:linux    # Linux
```

## 项目结构

```
desktop/
├── src/
│   ├── main/           # Electron 主进程代码
│   ├── preload/        # Electron 预加载脚本
│   └── renderer/       # React 前端代码
├── resources/          # 静态资源（图标等）
├── openspec/           # OpenSpec 提案和规范
├── scripts/            # 构建和实用脚本
└── docs/               # 项目文档
```

## CI/CD

项目使用 GitHub Actions 进行自动化构建和发布：

- **自动构建**: 推送到 main 分支或创建版本标签时自动触发构建
- **多平台支持**: 自动构建 Windows、macOS 和 Linux 平台的安装包
- **发布同步**: 自动将发布文件同步到 Azure Storage 以提供 CDN 加速

详细的 Azure 配置说明请参阅 [Azure Storage 同步配置文档](./docs/azure-storage-sync.md)。

## 贡献

欢迎贡献！请随时提交 Pull Request。

## 许可证

本项目采用 AGPL-3.0 许可证 - 详见 [LICENSE](./LICENSE) 文件。

## 相关链接

- [项目主页](https://github.com/HagiCode-org/desktop)
- [问题反馈](https://github.com/HagiCode-org/desktop/issues)

---

由 Hagicode 团队用 ❤️ 打造
