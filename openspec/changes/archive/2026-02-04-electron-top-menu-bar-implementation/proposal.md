# Proposal: 实现顶部菜单栏功能

## Change ID
`electron-top-menu-bar-implementation`

## Status
**ExecutionCompleted** | 2026-02-04

## Overview

在 Hagicode Desktop 应用中实现顶部菜单栏（Menu Bar），提供统一的导航入口，让用户能够在**本地系统管理**和**Hagicode Web**两个主要视图之间快速切换，无需打开外部浏览器。

## Background

Hagicode Desktop 当前架构提供两个核心功能：
1. **本地系统管理**：依赖项管理、Web 服务状态监控、包管理、应用设置
2. **Hagicode Web 访问**：通过嵌入式 Web 服务提供 Web 界面

当前用户体验存在以下问题：
- 需要在 Desktop 应用和外部浏览器之间切换完成任务
- 操作流程分散，增加用户认知负担
- 启动 Web 服务后需要手动打开浏览器并输入 URL
- 额外的浏览器窗口增加桌面环境管理复杂度

## Problem Statement

用户期望在统一的 Desktop 应用界面中完成所有操作，既包括本地系统管理，也包括 Hagicode Web 的功能访问。当前应用设置了 `autoHideMenuBar: true`，完全隐藏了菜单栏，缺乏原生应用应有的导航体验。

## Proposed Solution

### 核心方案

实现 Electron 原生顶部菜单栏，提供两个主要视图入口：

1. **本地系统管理菜单（System Management）**
   - 功能：作为当前主界面的入口
   - 内容：依赖项管理、Web 服务状态监控、包管理、应用设置
   - 交互：点击菜单后切换主窗口内容至系统管理视图

2. **Hagicode Web 菜单**
   - 功能：在 Electron 应用内直接加载和显示 Hagicode Web 界面
   - 实现方式：使用 `<webview>` 标签或 `BrowserView` API 加载 Web 服务 URL
   - 交互：
     - 点击菜单后，主窗口切换至 Web 界面视图
     - 确保 Web 服务已启动，未启动时提示用户或自动启动
     - 支持导航控制（前进、后退、刷新）

### 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Menu Bar                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────┐ │
│  │ System Mgmt      │  │ Hagicode Web       │  │  Help    │ │
│  │  - Dependencies  │  │  - Open Web UI   │  │          │ │
│  │  - Web Service   │  │  - Navigation    │  │          │ │
│  │  - Packages      │  │  - Dev Tools     │  │          │ │
│  └──────────────────┘  └──────────────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Main Window                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   View Switcher                        │  │
│  │  (Redux state: currentView = 'system' | 'web')        │  │
│  └───────────────────────────────────────────────────────┘  │
│                              │                               │
│              ┌───────────────┴───────────────┐              │
│              ▼                               ▼              │
│  ┌─────────────────────┐       ┌─────────────────────┐    │
│  │  System Management  │       │    Hagicode Web       │    │
│  │  - React Components │       │  - <webview> or     │    │
│  │  - Existing UI      │       │    BrowserView      │    │
│  └─────────────────────┘       └─────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Scope

### In Scope

1. **菜单栏实现**
   - 创建 `menu-manager.ts` 模块管理菜单创建和更新
   - 设置 `autoHideMenuBar: false` 显示菜单栏
   - 实现菜单项点击事件处理

2. **视图切换机制**
   - 新增 Redux slice 管理当前视图状态（`currentView`：`'system' | 'web'`）
   - 在渲染进程中实现视图切换组件
   - 添加视图切换的 IPC 通信通道

3. **Web 视图实现**
   - 创建 `WebView.tsx` 组件使用 `<webview>` 标签
   - 实现 Web 服务状态检测（切换前检查服务是否运行）
   - 添加导航控制（前进、后退、刷新）

4. **国际化支持**
   - 添加菜单相关的翻译条目（中英文）
   - 菜单文本动态更新响应语言切换

5. **键盘快捷键**
   - `Cmd/Ctrl+1` 切换到系统管理
   - `Cmd/Ctrl+2` 切换到 Hagicode Web

### Out of Scope

- 多标签页支持（留待后续扩展）
- 远程服务器菜单（留待后续扩展）
- 菜单自定义功能（留待后续扩展）
- Web 视图的高级功能（如缩放、打印等）

## Impact Analysis

### 用户体验改进

| 改进项 | 当前状态 | 目标状态 |
|--------|----------|----------|
| 应用上下文 | 需在应用和浏览器间切换 | 统一在 Desktop 应用内 |
| 操作流程 | 分散在多个窗口 | 集中在单一窗口 |
| 服务访问 | 手动打开浏览器输入 URL | 点击菜单直接访问 |
| 窗口管理 | 额外的浏览器窗口 | 单窗口管理 |

### 技术影响

**新增模块**：
- `src/main/menu-manager.ts`：菜单栏管理器
- `src/renderer/components/WebView.tsx`：Web 视图组件
- `src/renderer/store/slices/viewSlice.ts`：视图状态管理

**现有模块变更**：
- `src/main/main.ts`：
  - 设置 `autoHideMenuBar: false`
  - 集成 `menu-manager.ts`
  - 添加视图切换的 IPC 处理器
- `src/renderer/App.tsx`：
  - 集成视图切换逻辑
  - 根据视图状态渲染不同内容
- `src/renderer/store/index.ts`：添加 `viewReducer`
- 国际化文件：添加菜单相关翻译

**IPC 通信扩展**：
- `switch-view`：切换当前视图（从渲染进程到主进程）
- `view-changed`：视图变更通知（从主进程到渲染进程）

### 兼容性

| 平台 | 菜单行为 | 快捷键 | 特殊处理 |
|------|----------|--------|----------|
| Windows | 应用窗口顶部菜单栏 | `Ctrl+1/2` | 无 |
| macOS | 系统菜单栏（顶部屏幕菜单） | `Cmd+1/2` | 应用菜单处理 |
| Linux | 应用窗口顶部菜单栏 | `Ctrl+1/2` | 无 |

### 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| `<webview>` 标签安全限制 | 中 | 遵循 Electron 安全最佳实践，禁用 Node 集成 |
| 跨平台菜单行为差异 | 低 | 使用 Electron 的跨平台 Menu API |
| Web 服务未启动时切换 | 中 | 添加服务状态检查和自动启动逻辑 |
| 国际化文本长度差异 | 低 | 使用动态菜单更新机制 |

## Success Criteria

1. **功能完整性**
   - 菜单栏在所有平台上正确显示
   - 视图切换功能正常工作
   - Web 视图成功加载 Hagicode Web 界面

2. **用户体验**
   - 菜单项文本在中英文切换时正确更新
   - 键盘快捷键响应迅速
   - 视图切换无明显延迟（<500ms）

3. **兼容性**
   - 在 Windows、macOS、Linux 上菜单行为符合平台规范
   - Web 视图在不同分辨率下正常显示

4. **稳定性**
   - 无内存泄漏（长时间运行视图切换）
   - Web 服务崩溃后应用仍可正常切换回系统管理视图

## Related Changes

- **依赖**：无（独立功能）
- **被依赖**：未来可能扩展为多标签页或远程服务器菜单
- **冲突**：无

## References

- [Electron Menu API](https://www.electronjs.org/docs/latest/api/menu)
- [Electron `<webview>` Tag](https://www.electronjs.org/docs/latest/api/webview-tag)
- 现有规范：`electron-app`
- 现有规范：`dependency-management`
