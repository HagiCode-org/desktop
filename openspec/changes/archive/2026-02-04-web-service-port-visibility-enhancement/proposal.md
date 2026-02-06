# Proposal: Web服务端口信息可见性增强

**Change ID:** `web-service-port-visibility-enhancement`
**Status:** Proposed
**Created:** 2026-02-04

---

## 概述 (Overview)

本提案旨在增强 Hagicode Desktop 中嵌入式 Web 服务的端口信息可见性。当前用户在界面和日志中无法清晰地看到服务将使用的端口号，这降低了系统的可观察性和用户体验。通过在 UI 中展示端口信息、增强日志记录以及完善 IPC 通信，可以提升服务启动过程的透明度和问题排查效率。

### 目标 (Objectives)

1. **提升信息透明度** - 让用户能够在 UI 中看到即将使用的端口号
2. **增强日志记录** - 在启动日志中完整记录端口分配和检查信息
3. **改善可维护性** - 为问题诊断和审计提供完整的端口信息记录
4. **保持兼容性** - 确保变更不影响现有功能，跨平台兼容

## 问题陈述 (Problem Statement)

### 当前状况

- Web 服务启动时，UI 中不显示端口号，用户不清楚服务将监听哪个端口
- 启动日志中缺少端口配置和可用性检查的详细记录
- IPC 通信传递的数据结构中未包含端口信息字段
- Redux Store 的状态类型定义中缺少端口字段

### 痛点 (Pain Points)

1. **信息不透明** - 用户无法提前知晓服务使用的端口，可能导致配置冲突
2. **排查困难** - 日志记录不完整，不利于问题诊断和审计
3. **扩展受限** - 缺少端口信息展示，难以支持未来的端口配置功能
4. **用户体验** - 启动过程中的端口分配信息对用户不可见，增加了使用不确定性

## 解决方案 (Solution)

### 核心策略

**渐进式增强** - 在现有架构基础上添加端口信息展示，不改变核心服务启动逻辑：

1. **日志增强** - 在 `web-service-manager.ts` 中添加端口配置和检查的详细日志记录
2. **IPC 扩展** - 扩展 IPC 数据结构，在 `ProcessInfo` 中添加 `port` 字段
3. **UI 展示** - 在 `WebServiceStatusCard.tsx` 中添加端口信息展示区域
4. **状态管理** - 更新 Redux Store 类型定义，确保端口信息能够正确流转

### 技术实现

#### 配置说明

**默认端口**: 36556

系统使用端口 36556 作为嵌入式 Web 服务的默认端口，该端口需要在所有相关组件（配置、日志、UI 显示）中保持一致。

#### 1. 日志增强模块

**目标文件**: `src/main/web-service-manager.ts`

**改动点**:
- 在 `start()` 方法开始时记录配置的端口号（默认 36556）
- 在端口检查后记录可用性检查结果
- 在服务启动成功后记录最终使用的端口
- 日志级别: `info`

**日志示例**:
```typescript
log.info('[WebService] Starting with configured port:', this.config.port);
log.info('[WebService] Port availability check:', portAvailable ? 'available' : 'in use');
log.info('[WebService] Service started successfully on port:', this.config.port);
```

#### 2. IPC 通信扩展

**数据结构变更**:

`ProcessInfo` 接口（在 `web-service-manager.ts` 和 `webServiceSlice.ts` 中）:
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
  port: number; // 新增: 当前使用的端口号
}
```

#### 3. UI 组件更新

**目标文件**: `src/renderer/components/WebServiceStatusCard.tsx`

**改动点**:
- 在服务详情网格中添加端口信息展示项
- 显示格式: `<host>:<port>`（如 `localhost:36556`）
- 仅在服务运行或启动中时显示

**UI 布局**:
```
┌─────────────────────────────────────────────────────────┐
│ Web Service Status                    [Running]         │
│ Service is running and ready to use                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ [Start] [Restart] [Stop] [Open in Browser]             │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Service Details:                                        │
│ ┌─────────────┬─────────────┬─────────────┬───────────┐│
│ │ Service URL  │ Process ID  │ Uptime      │ Port      ││
│ │ http://...  │ 12345       │ 5m 30s      │ 36556     ││
│ └─────────────┴─────────────┴─────────────┴───────────┘│
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 4. Redux Store 更新

**目标文件**: `src/renderer/store/slices/webServiceSlice.ts`

**改动点**:
- 在 `WebServiceState` 接口中添加 `port: number` 字段
- 添加 `setPort` action 用于更新端口信息
- 在 `setProcessInfo` reducer 中处理端口字段
- 添加 `selectWebServicePort` selector

### 功能范围 (Scope)

### 包含功能 (In Scope)

#### 1. 日志增强
- [x] 在服务启动前记录配置的端口号
- [x] 在端口检查后记录可用性结果
- [x] 在服务启动成功后记录最终使用的端口
- [x] 确保日志格式统一，便于解析和查询

#### 2. IPC 通信
- [x] 扩展 `ProcessInfo` 接口，添加 `port` 字段
- [x] 更新主进程 `getStatus()` 方法，返回端口信息
- [x] 确保渲染进程能够接收并存储端口信息

#### 3. UI 展示
- [x] 在 `WebServiceStatusCard` 中添加端口信息展示
- [x] 使用清晰的视觉标识展示端口状态
- [x] 支持国际化（中英文）

#### 4. 状态管理
- [x] 更新 Redux Store 类型定义
- [x] 添加端口相关的 actions 和 selectors
- [x] 确保端口信息在状态更新时正确传递

### 不包含功能 (Out of Scope)

- 端口配置功能（用户修改端口号）- 后续版本考虑
- 端口冲突自动解决 - 后续版本考虑
- 多端口服务支持 - 当前单端口服务
- 端口绑定到特定网卡 - 当前绑定到 `0.0.0.0`

## 影响评估 (Impact)

### 开发影响

| 方面 | 影响 | 说明 |
|------|------|------|
| 代码改动 | 小 | 涉及 3 个主要文件，改动范围集中 |
| 测试工作 | 低 | 主要是 UI 展示验证，不涉及核心逻辑 |
| 文档更新 | 无 | 不需要更新用户文档，属于内部增强 |
| 依赖关系 | 无 | 不引入新的第三方依赖 |

### 用户影响

| 方面 | 改进 |
|------|------|
| 信息透明度 | 用户能够清晰看到服务使用的端口 |
| 问题排查 | 完整的日志记录便于诊断问题 |
| 用户体验 | 减少配置冲突，降低使用不确定性 |
| 功能扩展 | 为端口配置功能奠定基础 |

### 风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 类型定义不一致 | 低 | 使用 TypeScript 严格类型检查 |
| IPC 通信失败 | 低 | 保持向后兼容，端口字段可选 |
| UI 显示异常 | 低 | 添加默认值和错误处理 |
| 跨平台兼容性 | 低 | 端口信息展示不依赖平台特性 |

## 实施计划 (Implementation)

### 关键里程碑

1. **Step 1: 类型定义更新** - 更新所有相关的 TypeScript 接口
2. **Step 2: 日志增强** - 在主进程添加端口日志记录
3. **Step 3: IPC 扩展** - 扩展数据结构和通信逻辑
4. **Step 4: 状态管理** - 更新 Redux Store
5. **Step 5: UI 展示** - 在组件中添加端口显示
6. **Step 6: 国际化** - 添加中英文翻译
7. **Step 7: 测试验证** - 跨平台测试和验证

### 依赖关系

- **前置依赖**: 无，可以独立开发
- **并行工作**: 类型定义、日志增强和状态管理可并行进行
- **后续工作**: 端口配置功能依赖本次增强

## 成功标准 (Success Criteria)

### 技术指标

- [ ] TypeScript 编译无错误
- [ ] 所有单元测试通过
- [ ] 跨平台构建成功（Windows、macOS、Linux）
- [ ] IPC 通信正确传递端口信息
- [ ] Redux 状态更新正确

### 功能指标

- [ ] 启动日志包含完整的端口信息
- [ ] UI 中正确显示端口号
- [ ] 端口信息在服务状态变化时正确更新
- [ ] 国际化支持中英文

### 质量指标

- [ ] 无新增 bug
- [ ] 不影响现有功能
- [ ] 代码符合项目规范

## 替代方案 (Alternatives)

### 方案 A: 仅添加 UI 展示
- **优点**: 改动最小
- **缺点**: 日志记录不完整，不利于问题排查
- **评估**: 不推荐，未完全解决问题

### 方案 B: 添加完整端口配置功能
- **优点**: 一次性解决所有问题
- **缺点**: 开发周期长，风险较高
- **评估**: 不推荐，与"最小改动"原则冲突

### 方案 C: 分阶段实施（本方案）
- **优点**: 渐进式增强，风险可控
- **缺点**: 需要多次迭代
- **评估**: 推荐，平衡了功能需求和开发成本

## 相关资源 (Resources)

- **相关文件**:
  - `src/main/web-service-manager.ts` - Web 服务管理器
  - `src/renderer/components/WebServiceStatusCard.tsx` - 状态卡片组件
  - `src/renderer/store/slices/webServiceSlice.ts` - Redux Store
  - `src/renderer/i18n/locales/` - 国际化翻译文件

- **Electron 文档**: https://www.electronjs.org/docs
- **Redux Toolkit**: https://redux-toolkit.js.org/
- **项目约定**: `openspec/project.md`

## 变更历史 (Changelog)

| 日期 | 版本 | 变更说明 |
|------|------|----------|
| 2026-02-04 | 1.0.0 | 初始提案 |
