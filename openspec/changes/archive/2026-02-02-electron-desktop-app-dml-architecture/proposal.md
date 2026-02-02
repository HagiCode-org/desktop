# Proposal: 基于 DML 架构建立 Hagico 桌面应用

**Change ID:** `electron-desktop-app-dml-architecture`
**Status:** Proposed
**Created:** 2025-02-02

---

## 概述 (Overview)

本提案旨在基于已验证的 DML (SuperDucky) Electron 架构，为 Hagico Server 建立一个完整的跨平台桌面客户端应用。该应用将作为 Hagico Server 的本地管理和监控工具，提供系统托盘集成、状态通知和服务器控制功能。

### 目标 (Objectives)

1. **快速建立项目基础** - 通过迁移 DML 的成熟 Electron 架构，在数小时内完成项目初始化
2. **实现核心功能** - 建立系统托盘、主窗口和基本的服务器管理能力
3. **跨平台支持** - 确保 Windows、macOS、Linux 三平台的完整支持
4. **可持续开发** - 建立标准化的构建、测试和发布工作流

## 问题陈述 (Problem Statement)

### 当前状况

- Hagico Server 缺少官方桌面客户端工具
- 用户需要在本地管理和监控服务器运行状态
- 新项目需要从零开始搭建 Electron 架构，时间和成本较高

### 痛点 (Pain Points)

1. **重复投入** - 从零搭建 Electron 架构需要数天时间
2. **风险未知** - 新架构的跨平台兼容性和稳定性需要大量验证
3. **经验缺失** - 缺少已验证的打包、签名和发布配置
4. **扩展性差** - 缺少可插拔的架构设计，难以支持未来功能扩展

## 解决方案 (Solution)

### 核心策略

**架构复用** - 直接迁移 DML 项目的 Electron 架构和配置，包括：
- 项目结构和目录组织
- TypeScript + Vite 构建系统
- electron-builder 打包配置
- GitHub Actions CI/CD 工作流
- 开发工具链和脚本

**最小可行产品** - 首个版本聚焦核心功能：
- Windows 系统托盘集成
- 基础主窗口架构
- Hagico Server 状态监控
- 本地安装和更新支持

### 技术栈

| 组件 | 技术 | 来源 |
|------|------|------|
| 桌面框架 | Electron 39+ | DML 迁移 |
| 开发语言 | TypeScript 5.7+ | DML 迁移 |
| 构建系统 | Vite 6 | DML 迁移 |
| 打包工具 | electron-builder 26 | DML 迁移 |
| UI 框架 | React 19 + Tailwind 4 | DML 迁移 |
| CI/CD | GitHub Actions | DML 迁移 |
| 自动更新 | electron-updater | DML 迁移 |

### 架构设计

```
hagico-desktop/
├── client/                    # Electron 主目录（从 DML 迁移结构）
│   ├── src/
│   │   ├── main/             # Electron 主进程
│   │   │   ├── index.ts      # 主入口
│   │   │   ├── tray.ts       # 系统托盘（新增）
│   │   │   └── server.ts     # Hagico Server 通信（新增）
│   │   ├── renderer/         # React 渲染进程
│   │   │   └── App.tsx       # 主应用组件
│   │   └── preload/          # 预加载脚本
│   ├── resources/            # 图标和资源
│   ├── scripts/              # 构建和开发脚本
│   ├── package.json
│   ├── electron-builder.yml  # 打包配置
│   └── vite.config.mjs       # Vite 配置
├── .github/workflows/        # CI/CD 工作流
│   ├── build.yml             # 主构建流程
│   ├── build-windows.yml
│   ├── build-linux.yml
│   └── build-macos.yml
└── README.md
```

## 功能范围 (Scope)

### 包含功能 (In Scope)

#### Phase 1: 基础架构迁移
- [x] 项目初始化和目录结构
- [x] TypeScript + Vite 开发环境
- [x] Electron 主进程和渲染进程架构
- [x] 基础 UI 组件和布局框架

#### Phase 2: 系统托盘集成
- [x] Windows System Tray 实现
- [x] 托盘图标和右键菜单
- [x] 服务器状态实时显示
- [x] 通知和提醒功能

#### Phase 3: 服务器管理
- [x] Hagico Server 连接和状态查询
- [x] 启动/停止服务器控制
- [x] 基本配置界面

#### Phase 4: 跨平台构建
- [x] Windows (NSIS、AppX、Portable)
- [x] macOS (DMG、ZIP)
- [x] Linux (AppImage、deb、tar.gz)

#### Phase 5: 发布流程
- [x] GitHub Actions CI/CD
- [x] 自动更新支持
- [x] 版本管理脚本

### 不包含功能 (Out of Scope)

- Hagico Server 本体功能（不在本次范围）
- 高级服务器管理功能（日志查看、性能监控等）
- 多语言支持（后续版本考虑）
- 云同步功能（后续版本考虑）

## 影响评估 (Impact)

### 开发影响

| 方面 | 影响 | 说明 |
|------|------|------|
| 开发时间 | 减少 80% | 从数天降至数小时 |
| 代码复用 | 90% | 配置、脚本、工具链几乎完全复用 |
| 学习曲线 | 低 | 团队已熟悉 DML 架构 |
| 维护成本 | 低 | 统一的技术栈和模式 |

### 用户影响

| 方面 | 改进 |
|------|------|
| 安装体验 | 提供 Windows 原生安装包 |
| 日常使用 | 系统托盘快速访问 |
| 可靠性 | 基于验证的架构 |
| 更新体验 | 自动更新支持 |

### 风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| DML 架构不适配 | 低 | DML 和 Hagico 同为桌面工具，需求相似 |
| 跨平台兼容性问题 | 低 | DML 已验证三平台支持 |
| Hagico Server API 变化 | 中 | 设计灵活的通信层，支持 API 演进 |

## 实施计划 (Implementation)

### 关键里程碑

1. **Week 1: 架构迁移** - 完成 DML 架构迁移，基础开发环境就绪
2. **Week 2: 系统托盘** - 实现 Windows 托盘和基本交互
3. **Week 3: 服务器集成** - 集成 Hagico Server 管理功能
4. **Week 4: 测试和发布** - 跨平台测试和首个稳定版本发布

### 依赖关系

- **前置依赖**: Hagico Server 需提供本地管理 API
- **并行工作**: UI 开发和后端通信层可并行进行
- **后续工作**: 高级管理功能依赖基础架构完成

## 成功标准 (Success Criteria)

### 技术指标

- [ ] 在 Windows、macOS、Linux 三平台成功构建
- [ ] 系统托盘在 Windows 上正常运行
- [ ] 能够连接和控制 Hagico Server
- [ ] CI/CD 流程完整，自动化测试通过
- [ ] 应用体积 < 100MB（打包后）

### 质量指标

- [ ] 无关键 bug
- [ ] 跨平台功能一致性 ≥ 95%
- [ ] 启动时间 < 3 秒
- [ ] 内存占用 < 200MB（空闲时）

## 替代方案 (Alternatives)

### 方案 A: 从零搭建
- **优点**: 完全定制化
- **缺点**: 开发周期长（2-3 周），风险高
- **评估**: 不推荐，与"快速建立"目标冲突

### 方案 B: 使用 Tauri
- **优点**: 更小的包体积
- **缺点**: 需要重写所有配置，缺少参考项目
- **评估**: 不推荐，增加学习成本和风险

### 方案 C: Web 应用封装
- **优点**: 开发快速
- **缺点**: 系统托盘等原生功能受限
- **评估**: 不推荐，无法满足核心需求

## 相关资源 (Resources)

- **参考项目**: `/home/newbe36524/repos/newbe36524/DML`
- **Electron 文档**: https://www.electronjs.org/docs
- **electron-builder**: https://www.electron.build/
- **Hagico Server API**: (待补充)

## 变更历史 (Changelog)

| 日期 | 版本 | 变更说明 |
|------|------|----------|
| 2025-02-02 | 1.0.0 | 初始提案 |
