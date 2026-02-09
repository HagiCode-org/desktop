# Hagicode Desktop 项目文档

## 项目目的

Hagicode Desktop 是一款基于 Electron 的跨平台桌面应用程序，旨在作为 Hagicode Server 的本地管理和监控工具。该应用程序提供了嵌入式 Web 服务管理、包管理、依赖管理、远程服务器控制等功能，为用户提供统一的服务器管理体验。

### 核心功能

- **嵌入式 Web 服务管理**：启动、停止、重启内嵌的 Web 服务，实时监控服务状态
- **包管理**：安装、更新、重装 Web 服务包，支持版本检测、进度显示和多源安装
- **依赖管理**：系统依赖检查、自动安装、可视化展示
- **配置管理**：YAML 配置文件读写、数据目录配置、路径管理
- **远程服务器管理**：连接和控制远程 Hagicode Server，查看运行状态
- **系统托盘集成**：在 Windows/macOS/Linux 系统托盘/菜单栏中持久运行，实时状态显示
- **菜单栏功能**：关于、支持、设置等快捷菜单
- **国际化支持**：支持简体中文、英文等多种语言
- **自动更新**：检测、下载并安装新版本
- **首次使用引导**：新用户向导式引导流程，帮助快速上手
- **许可证管理**：查看和管理产品许可证信息

## 技术栈

### 核心框架

- **Electron 39.2.7**：跨平台桌面应用框架
- **Node.js 22.10.5**：运行时环境
- **TypeScript 5.7.3**：类型安全的 JavaScript 超集（严格模式）

### 前端技术

- **React 19.0.0**：UI 框架
- **Redux Toolkit 2.5.0**：状态管理
- **Redux Saga 1.4.2**：副作用管理
- **Redux Thunk**：异步 action 处理
- **Vite 6.0.7**：前端构建工具
- **Tailwind CSS 4.0.0**：实用优先的 CSS 框架
- **React Router DOM 7.11.0**：路由管理
- **Motion 12.33.0**：动画库

### UI 组件库

- **shadcn/ui**：基于 Radix UI 的组件集合
- **Radix UI**：无障碍的组件原语库（包含 Accordion, Avatar, Checkbox, Collapsible, Context Menu, Dialog, Dropdown Menu, Label, Popover, Progress, Radio Group, Scroll Area, Select, Separator, Slider, Switch, Tabs, Tooltip 等）
- **Lucide React 0.562.0**：图标库
- **Sonner 2.0.7**：Toast 通知组件
- **@dnd-kit**：拖拽功能库（核心、修饰符、可排序、工具）
- **Base UI 1.0.0**：React 基础 UI 组件
- **Command (cmdk) 1.1.1**：命令面板组件
- **Vaul 1.1.2**：抽屉组件

### 数据可视化

- **Recharts 2.15.4**：图表组件库
- **React Window 2.2.3**：虚拟化列表
- **Embla Carousel 8.6.0**：轮播组件

### 内容渲染

- **React Markdown 10.1.0**：Markdown 渲染
- **@bbob/react 4.3.1**：BBCode 解析（包含 core、html、preset-react）

### 国际化

- **i18next 25.7.3**：国际化框架
- **react-i18next 16.5.1**：React 集成

### 监控和分析

- **@microsoft/applicationinsights-react-js 19.3.8**：应用监控
- **@microsoft/applicationinsights-web 3.3.10**：Web 监控

### 构建和打包

- **electron-builder 26.0.12**：应用打包工具
- **concurrently 9.1.2**：并发运行命令
- **wait-on 8.0.1**：等待资源就绪
- **cross-env 7.0.3**：跨平台环境变量设置

### 其他依赖

- **axios 1.13.2**：HTTP 客户端
- **electron-log 5.4.3**：日志记录
- **electron-store 10.0.0**：持久化存储
- **electron-updater 6.6.2**：自动更新
- **semver 7.7.3**：版本号比较
- **js-yaml 4.1.1**：YAML 解析
- **ini 6.0.0**：INI 配置文件解析
- **adm-zip 0.5.16**：ZIP 文件处理
- **date-fns 4.1.0**：日期处理
- **React Day Picker 9.13.0**：日期选择器
- **React Resizable Panels 4.0.15**：可调整大小的面板
- **Input OTP 1.4.2**：OTP 输入组件
- **next-themes 0.4.6**：主题管理

### 开发依赖

- **@vitejs/plugin-react 4.3.4**：Vite React 插件
- **@tailwindcss/vite 4.0.0**：Vite Tailwind CSS 插件
- **tailwindcss-animate 1.0.7**：Tailwind 动画
- **tw-animate-css 1.4.0**：Tailwind 动画扩展

## 项目结构

```
hagicode-desktop/
├── src/
│   ├── main/              # Electron 主进程代码
│   │   ├── main.ts        # 应用入口、窗口管理、IPC 处理
│   │   ├── server.ts      # 远程服务器客户端
│   │   ├── config.ts      # 配置入口
│   │   ├── tray.ts        # 系统托盘集成
│   │   ├── web-service-manager.ts  # 嵌入式 Web 服务管理
│   │   ├── version-manager.ts      # 版本管理
│   │   ├── state-manager.ts        # 应用状态管理
│   │   ├── dependency-manager.ts   # 依赖管理
│   │   ├── license-manager.ts      # 许可证管理
│   │   ├── onboarding-manager.ts   # 首次使用引导管理
│   │   ├── package-source-config-manager.ts  # 包源配置管理
│   │   ├── path-manager.ts         # 路径管理（单例）
│   │   ├── config-manager.ts       # 配置文件管理（YAML）
│   │   ├── menu-manager.ts         # 菜单管理
│   │   ├── npm-mirror-helper.ts    # NPM 镜像辅助
│   │   ├── manifest-reader.ts      # 清单文件读取
│   │   └── package-sources/        # 包源实现
│   │       ├── index.ts
│   │       ├── package-source.ts
│   │       ├── local-folder-source.ts
│   │       ├── github-release-source.ts
│   │       └── http-index-source.ts
│   ├── preload/           # Preload 脚本
│   │   └── index.ts       # 暴露安全的 API 给渲染进程
│   ├── renderer/          # React 渲染进程代码
│   │   ├── App.tsx        # 主应用组件
│   │   ├── main.tsx       # React 入口
│   │   ├── components/    # UI 组件
│   │   │   ├── ui/        # shadcn/ui 基础组件
│   │   │   ├── providers/ # React Context 提供者
│   │   │   ├── settings/  # 设置组件（语言选择器等）
│   │   │   ├── onboarding/ # 首次使用引导组件
│   │   │   │   └── steps/ # 引导步骤组件
│   │   │   ├── WebServiceStatusCard.tsx
│   │   │   ├── SidebarNavigation.tsx
│   │   │   ├── VersionManagementPage.tsx
│   │   │   ├── LicenseManagementPage.tsx
│   │   │   ├── PackageSourceSelector.tsx
│   │   │   ├── SystemManagementView.tsx
│   │   │   ├── DependencyManagementCard.tsx
│   │   │   ├── DependencyCheckCard.tsx
│   │   │   ├── DependencyWarningBanner.tsx
│   │   │   ├── DependencyInstallConfirmDialog.tsx
│   │   │   ├── DependencyInstallWarningBanner.tsx
│   │   │   ├── DependencyStartConfirmDialog.tsx
│   │   │   ├── HagicodeActionButton.tsx
│   │   │   ├── WebView.tsx
│   │   │   ├── FolderConfigForm.tsx
│   │   │   ├── GitHubConfigForm.tsx
│   │   │   ├── SourceConfigForm.tsx
│   │   │   └── ThemeProvider.tsx
│   │   ├── hooks/         # 自定义 React Hooks
│   │   ├── store/         # Redux 状态管理
│   │   │   ├── index.ts
│   │   │   ├── slices/    # Redux slices
│   │   │   │   ├── webServiceSlice.ts
│   │   │   │   ├── dependencySlice.ts
│   │   │   │   ├── i18nSlice.ts
│   │   │   │   ├── viewSlice.ts
│   │   │   │   ├── licenseSlice.ts
│   │   │   │   ├── packageSourceSlice.ts
│   │   │   │   └── onboardingSlice.ts
│   │   │   ├── sagas/     # Redux sagas
│   │   │   │   ├── webServiceSaga.ts
│   │   │   │   ├── dependencySaga.ts
│   │   │   │   ├── i18nSaga.ts
│   │   │   │   ├── viewSaga.ts
│   │   │   │   ├── licenseSaga.ts
│   │   │   │   └── packageSourceSaga.ts
│   │   │   └── thunks/    # Redux thunks
│   │   │       └── onboardingThunks.ts
│   │   ├── i18n/          # 国际化配置和翻译文件
│   │   │   ├── config.ts
│   │   │   └── locales/   # 语言文件
│   │   │       ├── en-US/
│   │   │       │   ├── common.json
│   │   │       │   ├── components.json
│   │   │       │   ├── onboarding.json
│   │   │       │   └── pages.json
│   │   │       └── zh-CN/
│   │   │           ├── common.json
│   │   │           ├── components.json
│   │   │           ├── onboarding.json
│   │   │           └── pages.json
│   │   └── lib/           # 工具函数
│   └── types/             # TypeScript 类型定义
├── openspec/              # OpenSpec 规范和变更提案
│   ├── specs/             # 当前规范（已实现的功能）
│   │   ├── electron-app/  # 桌面应用规范
│   │   ├── dependency-management/  # 依赖管理规范
│   │   ├── package-management/      # 包管理规范
│   │   ├── package-source-management/  # 包源管理规范
│   │   ├── license-management/      # 许可证管理规范
│   │   ├── user-onboarding/         # 用户引导规范
│   │   ├── top-menu-bar/            # 顶部菜单栏规范
│   │   ├── process-lifecycle/       # 进程生命周期规范
│   │   ├── configuration-management/  # 配置管理规范
│   │   ├── user-interface/          # 用户界面规范
│   │   ├── electron-main/           # Electron 主进程规范
│   │   ├── i18n/                    # 国际化规范
│   │   ├── i18n-coverage/           # 国际化覆盖规范
│   │   ├── ui-components/           # UI 组件规范
│   │   ├── npm-mirror-config/       # NPM 镜像配置规范
│   │   ├── build-system/            # 构建系统规范
│   │   ├── ci-cd/                   # CI/CD 规范
│   │   └── version-management/      # 版本管理规范
│   ├── changes/           # 变更提案
│   │   └── archive/       # 已归档的变更
│   ├── project.md         # 本项目文档
│   ├── AGENTS.md          # AI 助手使用指南
│   └── PROPOSAL_DESIGN_GUIDELINES.md  # 提案设计指南
├── resources/             # 应用资源（图标等）
├── scripts/               # 构建和工具脚本
├── dist/                  # 编译输出
└── pkg/                   # 打包输出
```

## 项目约定

### 代码风格

- **TypeScript 严格模式**：启用所有严格类型检查（strict: true）
- **函数式组件**：使用 React Hooks 和函数式组件
- **命名约定**：
  - 组件：PascalCase（如 `WebServiceStatusCard`）
  - 函数/变量：camelCase（如 `getStatusColor`）
  - 类型/接口：PascalCase（如 `ServerStatus`）
  - 常量：UPPER_SNAKE_CASE（如 `DEFAULT_PORT`）
- **导入顺序**：
  1. Node.js 内置模块
  2. 第三方库
  3. 内部模块（使用 @ 别名）
  4. 相对路径导入

### 架构模式

- **Electron 架构**：
  - **Main Process**：管理应用生命周期、系统交互、进程管理
  - **Renderer Process**：React UI，通过 IPC 与主进程通信
  - **Preload Script**：安全的桥接层，暴露受限 API

- **状态管理**：
  - **Redux Toolkit** + **Redux Saga** 用于复杂异步状态管理
  - **Redux Thunk** 用于简单的异步操作
  - React hooks（useState、useEffect）用于组件级状态
  - Context API 用于全局配置和主题

- **IPC 通信模式**：
  - `ipcMain.handle` / `ipcRenderer.invoke`：双向请求-响应模式
  - `webContents.send` / `ipcRenderer.on`：主进程到渲染进程的事件推送

- **组件设计**：
  - 使用 shadcn/ui 作为基础组件库
  - 原子化设计，组件职责单一
  - Props 类型严格定义

- **管理器模式**：
  - 单例模式：PathManager、ConfigManager
  - 职责分离：每个管理器负责特定功能领域
  - 统一接口：通过 IPC 暴露管理器功能给渲染进程

- **包源架构**：
  - 抽象接口：PackageSource 定义统一的包源接口
  - 多种实现：LocalFolderSource、GitHubReleaseSource、HttpIndexSource
  - 可扩展性：支持轻松添加新的包源类型

### 测试策略

当前项目处于早期开发阶段，测试策略待完善：

- **单元测试**：待实现
- **集成测试**：提供基础的冒烟测试脚本（`scripts/smoke-test.js`）
- **E2E 测试**：待规划

### Git 工作流

- **主分支**：`main` - 稳定版本
- **功能分支**：`flow` - 当前开发分支
- **提交规范**：使用清晰的提交信息描述变更内容

## 域知识

### Hagicode Server

- **嵌入式 Web 服务**：内嵌在应用中的 Web 服务，默认端口 5000
- **远程服务器**：通过网络连接的独立 Hagicode Server 实例，默认端口 3000
- **包管理**：Web 服务以包的形式分发，支持安装、更新、版本管理
- **多源安装**：支持从多个来源安装 NORT 包（本地文件夹、GitHub Release、HTTP Index）
- **nort 包**：仅支持 nort 类型的软件包，文件名格式为 `hagicode-{version}-{platform}.zip`

### 配置系统

- **YAML 配置**：使用 appsettings.yml 存储应用配置
- **数据目录**：可配置的数据存储路径
- **路径管理**：跨平台路径处理，支持 Windows、macOS、Linux
- **包源配置**：支持配置多个包源，包括本地文件夹、GitHub 仓库和 HTTP 索引
- **NPM 镜像配置**：支持配置 NPM 镜像源以加速依赖安装

### 依赖管理

- **系统依赖**：检测和安装运行时所需的系统依赖（如 .NET 8.0 Runtime）
- **可视化展示**：以图形方式展示依赖关系和状态
- **自动修复**：提供依赖缺失时的自动修复功能
- **跨平台支持**：Windows（winget）、macOS（Homebrew）、Linux（apt 等）

### 许可证管理

- **许可证查看**：显示当前许可证的状态和有效期
- **许可证导入**：支持导入许可证文件激活产品
- **许可证验证**：验证许可证的有效性和权限范围

### 首次使用引导

- **自动触发**：检测到无已安装版本时自动显示引导
- **分步流程**：应用介绍、数据目录配置、下载包、安装依赖、启动服务
- **状态持久化**：记录引导进度，支持跳过和恢复

### 官方网站

- **hagicode.com**：官方网站，包含落地页和用户技术文档
- **builder.hagicode.com**：Docker Compose 文件构建站点
- **server.dl.hagicode.com**：官方更新源服务器

### 服务状态

- `running`：服务正在运行
- `stopped`：服务已停止
- `error`：服务出现错误或连接失败
- `starting`：服务正在启动
- `stopping`：服务正在停止

### 进程管理

- 应用通过 `spawn` 启动子进程运行 Web 服务
- 监控进程的 PID、运行时间、重启次数
- 支持优雅关闭和强制终止

## 重要约束

### 技术约束

- **Node.js 版本**：需要 Node.js 22.x 或更高版本
- **平台支持**：
  - Windows：Windows 10 及以上
  - macOS：macOS 11 (Big Sur) 及以上
  - Linux：主流发行版（Ubuntu、Fedora 等）
- **窗口启动**：应用启动时窗口以最大化状态显示
- **最小窗口尺寸**：800x600

### 安全约束

- **Context Isolation**：启用，确保渲染进程无法直接访问 Node.js API
- **Node Integration**：在渲染进程中禁用
- **Sandbox**：当前禁用（`sandbox: false`），需注意安全风险

### 业务约束

- **许可证**：AGPL-3.0
- **配置存储**：使用 electron-store 持久化用户配置
- **日志记录**：使用 electron-log 记录应用日志

## 外部依赖

### 系统依赖

- **操作系统 API**：
  - Windows：Shell API、托盘 API
  - macOS：菜单栏 API、Dock API
  - Linux：系统托盘 API（依赖桌面环境）

### 服务依赖

- **Hagicode Server**：
  - 嵌入式 Web 服务：本地文件系统
  - 远程服务器：HTTP API（可配置地址和端口）

- **GitHub API**：
  - 用于从 GitHub Release 获取包信息
  - 需要仓库所有者和名称
  - 支持可选的 Personal Access Token 认证

- **HTTP Index**：
  - 自定义 HTTP 索引源
  - 需要索引文件 URL

- **官方更新源**：
  - server.dl.hagicode.com/index.json
  - 支持压缩的 index.json.gz 格式

### 构建依赖

- **Node.js 生态系统**：npm 包管理
- **GitHub Actions**：CI/CD 自动化构建
- **Azure Storage**：发布包存储

## OpenSpec 开发指南

本项目使用 OpenSpec 进行规范驱动的开发。所有功能变更、架构调整和重大更新都需要通过 OpenSpec 变更提案流程。

### OpenSpec 工作流程

1. **创建变更提案**：在 `openspec/changes/` 下创建变更目录和提案文档
2. **编写规范增量**：使用 `## ADDED/MODIFIED/REMOVED Requirements` 描述变更
3. **实现任务**：按照 `tasks.md` 实现功能
4. **归档变更**：部署后将变更移至 `openspec/changes/archive/`

### 重要文档

- **[@/openspec/AGENTS.md](openspec/AGENTS.md)**：AI 助手的 OpenSpec 使用指南
  - 包含创建提案的详细步骤
  - 规范文件格式要求
  - CLI 命令参考
  - 最佳实践

- **[@/openspec/PROPOSAL_DESIGN_GUIDELINES.md](openspec/PROPOSAL_DESIGN_GUIDELINES.md)**：提案设计指南
  - UI 设计效果图要求（ASCII 艺术图、Mermaid 图表）
  - 代码流程图要求（流程图、时序图、架构图）
  - 代码变更清单格式
  - Mermaid 语法最佳实践

- **[@/openspec/specs/electron-app/spec.md](openspec/specs/electron-app/spec.md)**：当前应用规范
  - 跨平台桌面客户端需求
  - 系统托盘集成规范
  - 服务器状态监控和控制规范
  - 自动更新支持规范
  - 自动化构建和发布规范

- **[@/openspec/specs/dependency-management/spec.md](openspec/specs/dependency-management/spec.md)**：依赖管理规范
  - 系统依赖检测
  - 依赖安装和修复
  - 可视化展示

- **[@/openspec/specs/package-management/spec.md](openspec/specs/package-management/spec.md)**：包管理规范
  - 包安装和更新
  - 多源安装支持
  - 版本管理

### OpenSpec 快速参考

```bash
# 列出活跃的变更
openspec list

# 列出所有规范
openspec list --specs

# 查看变更或规范详情
openspec show [item]

# 验证变更
openspec validate [change-id] --strict

# 归档已部署的变更
openspec archive <change-id> --yes
```

### 变更提案模板

变更提案应包含以下文件：

- `proposal.md`：变更概述、原因、影响分析
- `tasks.md`：实现任务清单
- `design.md`（可选）：技术设计文档，包含 UI/UX 和代码流程图
- `specs/[capability]/spec.md`：规范增量

详细模板和格式要求请参考 `[@/openspec/AGENTS.md](openspec/AGENTS.md)` 和 `[@/openspec/PROPOSAL_DESIGN_GUIDELINES.md](openspec/PROPOSAL_DESIGN_GUIDELINES.md)`。

### 提案设计指南

在创建涉及 UI 设计或代码逻辑变更的提案时，必须遵循 `[@/openspec/PROPOSAL_DESIGN_GUIDELINES.md](openspec/PROPOSAL_DESIGN_GUIDELINES.md)` 中定义的标准：

#### UI 设计效果图要求

当提案涉及新增或修改用户界面时，必须包含：
- ASCII 艺术图绘制界面原型
- Mermaid 时序图描述用户交互流程
- 状态说明（正常、悬停、禁用、错误状态）

#### 代码流程图要求

当提案涉及数据流或服务交互变更时，必须包含：
- Mermaid 流程图描述数据流
- 时序图描述服务间交互
- 代码变更表格列出所有涉及的文件和变更原因

#### 审核清单

在提交提案前，请确认：
- 如果涉及 UI 变更，是否包含了所有界面的设计图？
- 如果涉及代码逻辑变更，是否包含了数据流图？
- 所有图表都有清晰的标题和说明？
- 是否包含了完整的代码变更表格？

## 开发指南

### 环境设置

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 类型检查
npm run build:tsc:check

# 构建所有
npm run build:all

# 生产构建
npm run build:prod
```

### 调试

- **主进程调试**：DevTools 在开发模式下自动打开
- **渲染进程调试**：使用 Chrome DevTools
- **日志查看**：使用 electron-log 查看应用日志

### 添加新功能

1. 遵循 OpenSpec 工作流程创建变更提案
2. 实现功能时遵循项目的代码风格和架构模式
3. 添加必要的 TypeScript 类型定义
4. 更新国际化文件（如需要）
5. 更新 `tasks.md` 中的任务状态

## 最近变更

根据 Git 历史，最近的主要变更包括：

- **首次使用引导流程**：完整的四步向导式引导，帮助新用户快速上手
- **许可证管理功能**：查看和管理产品许可证信息
- **多源包管理增强**：支持 GitHub Release 和 HTTP Index 包源
- **自定义 HTTP Index 包源**：支持从自定义 HTTP 索引安装包
- **安装按钮加载状态**：改进安装按钮的用户反馈
- **Electron 白屏问题修复**：修复打包应用的白屏显示问题
- **空状态按钮清晰度改进**：优化空状态下的按钮文案
- **飞书构建发布通知**：CI/CD 构建完成后发送飞书通知
- **系统托盘 UI 状态显示增强**：改进托盘图标的状态显示和交互
- **安装向导数据目录配置**：首次启动时配置数据目录
- **关于和支持菜单**：添加应用信息和帮助文档入口
- **WebService 停止功能修复**：修复缺失的导入
- **多源 NORT 包安装器**：支持从多个来源安装包
- **包重装功能**：添加重装已安装包的功能
- **依赖管理集成**：将依赖检查集成到版本管理工作流
- **侧边栏导航重构**：改进导航布局和交互
- **shadcn 默认颜色系统**：采用 shadcn 默认颜色方案
- **index.json 压缩输出**：减少文件大小以加快下载速度

### 当前活跃提案

- **unified-update-source-config**：统一应用更新源配置，将 HTTP 源设置为开发版本和正式版本的主要更新源

完整的变更历史请查看 `openspec/changes/archive/` 目录。

## 许可证

本项目采用 AGPL-3.0 许可证。详见 [LICENSE](../LICENSE) 文件。
