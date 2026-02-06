# Proposal: 重构应用布局为侧边栏导航模式

**Change ID:** `sidebar-navigation-layout-refactor`
**Status:** ExecutionCompleted
**Created:** 2026-02-05
**Completed:** 2026-02-05

---

## 概述 (Overview)

本提案旨在重构 Hagicode Desktop 的导航架构，从当前的顶部导航栏（`TopNavigation`）+ Electron 原生菜单栏模式，转换为统一的管理后台式侧边栏导航模式。此重构将统一导航入口、简化架构并提升用户体验。

### 目标 (Objectives)

1. **统一导航入口** - 移除冗余的导航系统，将所有一级功能集中在左侧侧边栏
2. **简化应用架构** - 移除 MenuManager 中的视图切换逻辑，降低主进程与渲染进程的耦合
3. **提升空间利用** - 移除顶部菜单栏，增加主内容区域可用空间
4. **改善用户体验** - 采用管理后台应用的标准交互模式，减少认知负担

## 问题陈述 (Problem Statement)

### 当前状况

Hagicode Desktop 当前采用**双重导航架构**：
- **顶部导航组件**（`TopNavigation`）：提供系统管理、Web 服务、依赖管理、版本管理四个主要视图的切换
- **Electron 原生菜单栏**（`MenuManager`）：包含视图菜单、Hagicode Web 菜单等，部分功能与顶部导航重复

### 痛点 (Pain Points)

1. **菜单冗余** - 应用同时拥有顶部导航组件和 Electron 原生菜单栏，造成功能重复和用户体验混乱
2. **导航分散** - 一级菜单功能分散在两个位置，不符合管理后台类应用的统一导航模式
3. **空间利用不足** - 原生顶部菜单占用窗口空间，且在管理后台场景下价值有限
4. **架构不一致** - 视图切换逻辑存在于渲染进程（TopNavigation）和主进程（MenuManager）两处，增加维护复杂度

## 解决方案 (Solution)

### 核心策略

**管理后台式布局** - 将应用重新设计为标准的左侧侧边栏 + 右侧内容区布局：

1. **左侧折叠式侧边栏** - 整合所有一级功能导航
2. **移除原生菜单栏** - 设置 `autoHideMenuBar: true`，清理 MenuManager
3. **统一视图切换逻辑** - 所有导航通过 Redux `viewSlice` 管理
4. **响应式设计** - 支持侧边栏折叠/展开，适配不同屏幕尺寸

### 布局架构对比

#### 当前布局
```
┌──────────────────────────────────────────────┐
│  Electron Native Menu (固定占用)             │
├──────────────────────────────────────────────┤
│  [H] TopNavigation (系统管理 Web 服务 ...)   │
├──────────────────────────────────────────────┤
│                                              │
│  Main Content Area                           │
│                                              │
│                                              │
└──────────────────────────────────────────────┘
```

#### 重构后布局
```
┌──────────────────────────────────────────────┐
│ ┌─────────┐                                  │
│ │         │  Main Content Area               │
│ │ Sidebar │  (Expanded Space)                │
│ │         │                                  │
│ └─────────┘                                  │
└──────────────────────────────────────────────┘
```

### 功能范围 (Scope)

#### 包含功能 (In Scope)

1. **侧边栏导航组件**（`SidebarNavigation`）
   - 可折叠/展开的左侧侧边栏
   - 导航项：系统管理、Web 服务、依赖管理、版本管理
   - 使用 shadcn/ui 的 `Collapsible` 或 `Sheet` 组件
   - 支持键盘快捷键（`Ctrl/Cmd + B`）切换

2. **Electron 菜单栏禁用**
   - 在 `main.ts` 设置 `autoHideMenuBar: true`
   - 简化 `MenuManager`，保留必要的系统级菜单项（应用退出、关于等）

3. **视图组件调整**
   - `App.tsx` 移除 `TopNavigation`，添加 `SidebarNavigation`
   - 调整主内容区域布局以适应侧边栏

4. **状态管理优化**
   - 统一视图切换逻辑到 Redux `viewSlice`
   - 可选：添加 `sidebarSlice` 管理侧边栏折叠/展开状态

5. **国际化调整**
   - 添加侧边栏相关翻译 key（`sidebar.toggle`, `sidebar.collapse` 等）
   - 移除原生菜单相关翻译条目

#### 不包含功能 (Out of Scope)

- 二级导航设计（各视图内部导航保持不变）
- 主题系统变更（侧边栏适配现有深色主题）
- Web 视图内的导航控制（保留现有功能）

## 影响评估 (Impact)

### 用户体验改进

| 方面 | 当前 | 重构后 | 改进 |
|------|------|--------|------|
| 导航入口数量 | 2 个（顶部导航 + 菜单栏） | 1 个（侧边栏） | 统一 |
| 内容区域高度 | 受顶部导航和菜单栏挤压 | 增加菜单栏高度空间 | +~30px |
| 导航模式 | Web 应用式 | 管理后台式 | 符合场景 |
| 快捷键支持 | 菜单栏快捷键 | 侧边栏快捷键 | 保持 |

### 代码质量提升

| 方面 | 改进 |
|------|------|
| 架构简化 | 移除 MenuManager 中的视图切换逻辑（~50 行代码） |
| 维护性增强 | 导航逻辑集中在 React 组件层，便于后续扩展 |
| 一致性改进 | 完全使用 React + shadcn/ui 组件，减少对 Electron 原生 API 依赖 |
| IPC 通信减少 | 移除 `view-changed` 事件（由菜单栏触发） |

### 风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 用户习惯改变 | 低 | 侧边栏是管理后台应用的标准模式，学习成本低 |
| 快捷键冲突 | 低 | 移除菜单栏快捷键，在侧边栏重新实现 |
| 平台兼容性 | 低 | 纯 React 实现，跨平台一致 |
| 破坏性变更 | 中 | 需要回归测试所有视图切换场景 |

## 技术实现要点

### 1. 侧边栏组件设计

```typescript
// src/renderer/components/SidebarNavigation.tsx
interface SidebarNavigationProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export default function SidebarNavigation({ collapsed, onToggle }: SidebarNavigationProps) {
  const { t } = useTranslation('common');
  const dispatch = useDispatch();
  const currentView = useSelector((state: RootState) => state.view.currentView);
  const webServiceUrl = useSelector((state: RootState) => state.view.webServiceUrl);

  const navigationItems = [
    { id: 'system', label: t('sidebar.dashboard'), icon: Settings },
    { id: 'web', label: t('sidebar.webService'), icon: Globe },
    { id: 'dependency', label: t('sidebar.dependencyManagement'), icon: Package },
    { id: 'version', label: t('sidebar.versionManagement'), icon: FileText },
  ];

  // 实现细节见 design.md
}
```

### 2. 主进程调整

```typescript
// src/main/main.ts
const mainWindow = new BrowserWindow({
  // ... 其他配置
  autoHideMenuBar: true, // 禁用原生菜单栏
});
```

### 3. 布局结构调整

```typescript
// src/renderer/App.tsx
<div className="flex min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
  {/* 左侧侧边栏 */}
  <SidebarNavigation />

  {/* 主内容区域 */}
  <div className="flex-1 overflow-auto">
    {/* 视图内容 */}
  </div>
</div>
```

## 实施计划 (Implementation)

### 关键里程碑

1. **Phase 1: 准备工作** - 审查现有代码，确认技术方案
2. **Phase 2: 侧边栏组件开发** - 实现 `SidebarNavigation` 组件
3. **Phase 3: 主进程调整** - 禁用菜单栏，简化 MenuManager
4. **Phase 4: 布局重构** - 调整 App.tsx 和相关样式
5. **Phase 5: 国际化和清理** - 更新翻译，移除废弃代码
6. **Phase 6: 测试和验证** - 回归测试所有功能

### 依赖关系

- **前置依赖**: 无（独立功能模块）
- **并行工作**: 侧边栏组件开发和主进程调整可并行进行
- **后续工作**: 侧边栏功能扩展（如二级导航）

## 成功标准 (Success Criteria)

### 技术指标

- [ ] 侧边栏在所有视图下正常显示和交互
- [ ] 视图切换功能完整，无破坏性变更
- [ ] 原生菜单栏已隐藏（`autoHideMenuBar: true`）
- [ ] MenuManager 中视图切换相关代码已移除
- [ ] 所有现有测试通过（如有）
- [ ] Windows/macOS/Linux 三平台表现一致

### 质量指标

- [ ] 侧边栏折叠/展开动画流畅（60fps）
- [ ] 键盘快捷键响应及时
- [ ] 无控制台错误或警告
- [ ] 国际化支持完整（中文、英文）
- [ ] 响应式设计正常工作（不同窗口尺寸）

### 用户体验指标

- [ ] 用户能在 5 秒内理解新的导航模式
- [ ] 视图切换路径不超过 1 次点击
- [ ] 侧边栏折叠状态下图标可识别
- [ ] Web 服务视图禁用状态有清晰提示

## 替代方案 (Alternatives)

### 方案 A: 保留菜单栏，添加侧边栏
- **优点**: 保留系统级菜单功能
- **缺点**: 导航仍然冗余，空间利用不足
- **评估**: 不推荐，与"统一导航"目标冲突

### 方案 B: 仅移除菜单栏，保留顶部导航
- **优点**: 改动最小
- **缺点**: 不符合管理后台应用标准，空间利用不足
- **评估**: 不推荐，仅部分解决痛点

### 方案 C: 折叠式顶部导航（类似移动端）
- **优点**: 节省垂直空间
- **缺点**: 水平空间利用不足，不如侧边栏模式
- **评估**: 不推荐，不适合桌面应用

## 相关资源 (Resources)

- **shadcn/ui Sidebar 组件**: https://ui.shadcn.com/docs/components/sidebar
- **shadcn/ui Collapsible 组件**: https://ui.shadcn.com/docs/components/collapsible
- **Radix UI Collapsible**: https://www.radix-ui.com/docs/primitives/components/collapsible
- **Lucide React 图标**: https://lucide.dev/

## 变更历史 (Changelog)

| 日期 | 版本 | 变更说明 |
|------|------|----------|
| 2026-02-05 | 1.0.0 | 初始提案 |
