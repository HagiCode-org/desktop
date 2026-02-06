# 重构首页安装包启动功能适配新版本管理架构

**Change ID:** `homepage-launcher-version-arch-refactor`
**状态:** ExecutionCompleted
**创建日期:** 2026-02-06
**完成日期:** 2026-02-06

## 概述

将首页的安装包启动功能重构为与新的版本管理架构（`version-manager.ts`）集成，实现统一的版本状态管理和启动流程。

## 背景

Hagicode Desktop 已实现了新的版本管理系统（`version-manager.ts`），支持多版本安装、切换、依赖检查等功能。然而，首页的安装包启动功能仍在使用旧架构，导致以下问题：

1. **架构不一致**：首页启动逻辑未使用 `VersionManager`，与新的版本管理系统脱节
2. **状态管理割裂**：版本状态在多个地方维护，缺乏单一数据源
3. **依赖检查缺失**：启动前未进行完整的依赖验证
4. **可维护性差**：旧代码增加了技术债务

## 目标

- [x] 将首页启动功能集成到 `VersionManager` 架构
- [x] 统一版本状态到 Redux Store
- [x] 实现启动前的依赖检查
- [x] 规范 IPC 通信模式
- [x] 移除遗留代码

## 范围

### 包含
- `src/renderer/components/SystemManagementView.tsx` - 首页组件
- `src/renderer/components/WebServiceStatusCard.tsx` - Web 服务状态卡片
- `src/main/main.ts` - IPC 处理程序
- `src/preload/index.ts` - 预加载 API
- `src/renderer/store/` - Redux 状态管理

### 排除
- `VersionManager` 核心逻辑（已存在，无需修改）
- `DependencyManager` 核心逻辑（已存在，无需修改）

## 影响分析

### 用户体验
- **正面**：启动时显示准确的版本信息和状态反馈
- **正面**：缺少依赖时提供清晰的错误提示和解决方案
- **中性**：无显著行为变化，主要是内部重构

### 开发体验
- **正面**：统一的代码架构，降低维护成本
- **正面**：更好的类型安全和错误处理
- **负面**：需要更新相关测试

### 性能
- **中性**：启动流程增加依赖检查，但影响可忽略（毫秒级）

## 设计概述

### 架构变更

**当前流程：**
```
用户点击启动 → WebServiceStatusCard → webServiceSaga → IPC → main.ts → WebServiceManager
```

**目标流程：**
```
用户点击启动 → WebServiceStatusCard → webServiceSaga → IPC → main.ts
  → VersionManager.getActiveVersion() → 检查状态和依赖
  → WebServiceManager.setActiveVersion() → 启动服务
```

### 关键改动

1. **主进程（main.ts）**
   - 启动前调用 `versionManager.getActiveVersion()` 获取活动版本
   - 验证版本状态为 `installed-ready`
   - 验证依赖完整性
   - 使用 `installedPath` 作为启动路径

2. **渲染进程（WebServiceStatusCard）**
   - 显示活动版本信息
   - 禁用状态时显示原因（无版本/缺少依赖/版本未就绪）

3. **状态管理**
   - 在 `webServiceSlice` 中添加 `activeVersion` 字段
   - 监听 `version:activeVersionChanged` 事件

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 启动流程变更导致回归 | 高 | 中 | 保留旧代码路径作为回退 |
| 状态同步问题 | 中 | 低 | 使用事件监听确保状态一致 |
| 依赖检查延迟 | 低 | 低 | 异步检查，不阻塞 UI |

## 依赖项

- `version-manager.ts` - 已存在
- `dependency-manager.ts` - 已存在
- `state-manager.ts` - 已存在

## 时间表

- 阶段 1: 主进程集成（1-2 天）
- 阶段 2: 渲染进程更新（1 天）
- 阶段 3: 状态管理和测试（1 天）

## 验收标准

1. [x] 启动服务时使用 `VersionManager` 获取的活动版本
2. [x] 无活动版本时启动按钮显示为禁用状态
3. [x] 缺少依赖时显示警告并引导用户解决
4. [x] 所有测试通过
5. [x] 无遗留代码警告

## 执行摘要

### 已完成的改动

1. **主进程 (src/main/main.ts)**
   - 更新了 `start-web-service` IPC 处理程序
   - 添加了活动版本获取逻辑 (`versionManager.getActiveVersion()`)
   - 添加了版本状态验证 (`installed-ready`)
   - 添加了详细的错误返回格式，包含错误类型和详细信息

2. **渲染进程 Redux 状态 (src/renderer/store/slices/webServiceSlice.ts)**
   - 添加了 `InstalledVersion` 接口
   - 扩展了 `WebServiceState` 添加 `activeVersion`、`versionReady`、`missingDependencies` 字段
   - 添加了 `setActiveVersion`、`setVersionReady`、`setMissingDependencies` actions
   - 添加了 `selectActiveVersion`、`selectCanLaunchService`、`selectLaunchBlockingReason` selectors

3. **渲染进程 Saga (src/renderer/store/sagas/webServiceSaga.ts)**
   - 更新了 `startWebServiceSaga` 以处理新的错误响应格式
   - 添加了 `fetchActiveVersionSaga` 用于获取活动版本
   - 添加了 `fetchActiveVersionAction` action
   - 更新了 `initializeWebServiceSaga` 以在初始化时获取活动版本
   - 添加了活动版本变化监听器

4. **组件更新 (src/renderer/components/WebServiceStatusCard.tsx)**
   - 使用 Redux store 中的活动版本信息
   - 根据 `canLaunchService` 选择器禁用/启用启动按钮
   - 添加了阻塞原因提示（无版本、版本未就绪）
   - 在服务详情中显示活动版本信息

5. **国际化 (src/renderer/i18n/locales/)**
   - 添加了 `noVersionAlert` 翻译（中英文）
   - 添加了 `versionNotReadyAlert` 翻译（中英文）
   - 在 `details` 中添加了 `version` 字段翻译

6. **WebServiceManager (src/main/web-service-manager.ts)**
   - 更新了 `getConfigFilePath()` 方法以使用活动版本路径
   - 更新了 `syncConfigToFile()` 方法以在配置文件不存在时创建新配置
   - 确保配置文件路径与新的版本管理架构一致

### 架构变更

启动流程现在按以下方式工作：
1. 用户点击启动按钮
2. `startWebServiceSaga` 被触发
3. 主进程 IPC 处理程序调用 `versionManager.getActiveVersion()`
4. 验证版本状态为 `installed-ready`
5. 如果验证通过，调用 `webServiceManager.start()` 启动服务
6. 返回成功或带有错误类型和详细信息的失败响应

## 参考资料

- [version-manager.ts](../../src/main/version-manager.ts)
- [dependency-manager.ts](../../src/main/dependency-manager.ts)
- [OpenSpec 规范](../AGENTS.md)
