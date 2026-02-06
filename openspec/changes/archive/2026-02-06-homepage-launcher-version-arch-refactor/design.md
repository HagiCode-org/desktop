# 设计文档：首页启动功能与版本管理架构集成

**提案:** homepage-launcher-version-arch-refactor
**创建日期:** 2026-02-06

## 1. 架构概览

### 1.1 当前架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         渲染进程                                  │
├─────────────────────────────────────────────────────────────────┤
│  WebServiceStatusCard  ──→  webServiceSaga  ──→  IPC 调用        │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                         主进程                                    │
├─────────────────────────────────────────────────────────────────┤
│  IPC Handler  ──→  WebServiceManager.setActiveVersion()         │
│                      ──→  启动可执行文件                          │
└─────────────────────────────────────────────────────────────────┘
```

**问题：**
- 直接依赖 `WebServiceManager.setActiveVersion()`
- 未验证版本状态
- 未检查依赖完整性

### 1.2 目标架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         渲染进程                                  │
├─────────────────────────────────────────────────────────────────┤
│  WebServiceStatusCard  ──→  webServiceSaga  ──→  IPC 调用        │
│       ↑                                                            │
│       │                                                            │
│  Redux Store (activeVersion)                                      │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                         主进程                                    │
├─────────────────────────────────────────────────────────────────┤
│  IPC Handler  ──→  VersionManager.getActiveVersion()             │
│                      ──→  验证状态 (installed-ready)              │
│                      ──→  DependencyManager.checkDependencies()  │
│                      ──→  WebServiceManager.setActiveVersion()   │
│                      ──→  启动可执行文件                          │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 数据流设计

### 2.1 启动流程

```
用户点击启动
    │
    ▼
检查 activeVersion 状态
    │
    ├─ 无版本 → 禁用按钮，显示"前往版本管理"
    │
    ├─ 版本未就绪 (installed-incomplete) → 禁用按钮，显示"缺少依赖"
    │
    └─ 版本就绪 (installed-ready) → 启用按钮
            │
            ▼
        点击启动
            │
            ▼
        IPC: start-web-service
            │
            ▼
    主进程: getActiveVersion()
            │
            ▼
    验证版本状态
            │
            ├─ 验证失败 → 返回错误
            │
            └─ 验证通过 → 检查依赖
                    │
                    ├─ 依赖缺失 → 返回依赖错误
                    │
                    └─ 依赖满足 → 启动服务
                            │
                            ▼
                        返回成功
```

### 2.2 状态同步

```
主进程事件                         渲染进程
────────────────────────────────────────────
version:activeVersionChanged  ──→  Redux Action
                                      │
                                      ▼
                                  更新 Store
                                      │
                                      ▼
                                  组件重渲染
```

## 3. 类型定义

### 3.1 扩展 ProcessInfo

```typescript
export interface ProcessInfo {
  status: ProcessStatus;
  pid: number | null;
  uptime: number;
  startTime: number | null;
  url: string | null;
  restartCount: number;
  phase: StartupPhase;
  phaseMessage?: string;
  port: number;
  // 新增
  activeVersion?: InstalledVersion | null;
}
```

### 3.2 启动错误类型

```typescript
export type LaunchError =
  | { type: 'no-active-version' }
  | { type: 'version-not-ready'; version: InstalledVersion }
  | { type: 'missing-dependencies'; dependencies: DependencyCheckResult[] }
  | { type: 'unknown'; message: string };
```

## 4. IPC 协议

### 4.1 新增/修改的 IPC 通道

| 通道 | 方向 | 描述 |
|------|------|------|
| `start-web-service` | 渲染→主 | 启动 Web 服务（已存在，需修改实现） |
| `version:getActive` | 渲染→主 | 获取活动版本（已存在） |
| `version:activeVersionChanged` | 主→渲染 | 活动版本变化事件（已存在） |

### 4.2 启动响应格式

```typescript
// 成功
{ success: true }

// 失败
{
  success: false,
  error: {
    type: LaunchError['type'],
    details?: any
  }
}
```

## 5. Redux 状态设计

### 5.1 webServiceSlice 扩展

```typescript
export interface WebServiceState {
  // ... 现有字段
  activeVersion: InstalledVersion | null;
  versionReady: boolean;  // 是否可以启动
  missingDependencies: DependencyCheckResult[];  // 缺失的依赖
}
```

### 5.2 新增 Selectors

```typescript
export const selectActiveVersion = (state: RootState) =>
  state.webService.activeVersion;

export const selectCanLaunchService = (state: RootState) => {
  const version = state.webService.activeVersion;
  return version?.status === 'installed-ready';
};

export const selectLaunchBlockingReason = (state: RootState) => {
  const version = state.webService.activeVersion;
  if (!version) return 'no-version';
  if (version.status !== 'installed-ready') return 'version-not-ready';
  if (state.webService.missingDependencies.length > 0) return 'missing-dependencies';
  return null;
};
```

## 6. 组件行为

### 6.1 WebServiceStatusCard

**状态映射：**
- `activeVersion == null` → 显示"未安装版本"提示
- `activeVersion.status == 'installed-incomplete'` → 显示"缺少依赖"警告
- `activeVersion.status == 'installed-ready'` → 正常显示启动按钮

**启动按钮状态：**
- `!canLaunchService` → 禁用
- `isOperating || isTransitioning` → 禁用并显示加载中

### 6.2 SystemManagementView

**版本信息卡片：**
- 显示活动版本详情
- 缺少依赖时显示警告和引导

## 7. 错误处理

### 7.1 错误显示优先级

1. 无活动版本 → "前往版本管理安装版本"
2. 版本未就绪 → "检查并安装缺失的依赖"
3. 依赖缺失 → 列出缺失的依赖类型
4. 启动失败 → 显示具体错误信息

### 7.2 用户引导

| 错误类型 | 引导操作 |
|----------|----------|
| 无版本 | "前往版本管理" 按钮 |
| 缺少依赖 | "前往版本管理查看依赖" 按钮 |
| 启动失败 | 显示错误详情和重试按钮 |

## 8. 向后兼容

为降低风险，实施期间保留以下兼容措施：

1. **回退路径**：如果 `VersionManager` 调用失败，回退到直接使用 `WebServiceManager`
2. **渐进式迁移**：先实现新逻辑，通过特性开关控制
3. **日志记录**：详细记录所有版本相关操作，便于排查问题

## 9. 性能考虑

- **缓存**：活动版本信息缓存于 Redux Store，避免频繁 IPC 调用
- **懒加载**：依赖检查仅在启动时执行
- **异步操作**：所有检查均为异步，不阻塞 UI

## 10. 未来扩展

此设计为以下功能预留空间：
- 多版本快速切换
- 启动前依赖自动安装
- 版本健康检查
- 启动配置持久化
