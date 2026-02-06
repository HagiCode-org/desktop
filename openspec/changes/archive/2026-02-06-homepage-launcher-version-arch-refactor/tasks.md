# 实施任务清单

**提案:** homepage-launcher-version-arch-refactor
**创建日期:** 2026-02-06

## 阶段 1: 主进程集成

### 1.1 更新 IPC 处理程序 (main.ts)

- [ ] 在启动 Web 服务前添加版本检查逻辑
- [ ] 调用 `versionManager.getActiveVersion()` 获取活动版本
- [ ] 验证版本状态为 `installed-ready`
- [ ] 使用版本的 `installedPath` 作为启动路径
- [ ] 添加错误处理和日志记录

**验收标准:**
- 启动服务时使用正确的版本路径
- 无活动版本时返回明确的错误信息
- 版本未就绪时返回状态信息

**涉及文件:** `src/main/main.ts`

---

### 1.2 添加依赖检查到启动流程

- [ ] 在启动前调用 `dependencyManager.checkFromManifest()`
- [ ] 将依赖检查结果传递给渲染进程
- [ ] 依赖不满足时返回详细错误信息
- [ ] 添加依赖缺失时的用户引导

**验收标准:**
- 启动前自动检查依赖
- 依赖缺失时提供清晰的错误提示
- 错误信息包含缺失的依赖类型

**涉及文件:** `src/main/main.ts`

---

## 阶段 2: 渲染进程更新

### 2.1 更新 WebServiceStatusCard 组件

- [ ] 从 Redux store 获取活动版本信息
- [ ] 根据版本状态更新启动按钮状态
- [ ] 无版本时显示"前往版本管理"引导
- [ ] 缺少依赖时显示警告信息

**验收标准:**
- 按钮状态与版本状态同步
- 错误信息清晰且可操作
- UI 响应及时

**涉及文件:** `src/renderer/components/WebServiceStatusCard.tsx`

---

### 2.2 更新 SystemManagementView 组件

- [ ] 移除直接的 IPC 调用（改用 Redux saga）
- [ ] 统一使用 Redux store 中的版本状态
- [ ] 优化版本信息展示

**验收标准:**
- 无直接 IPC 调用
- 版本信息准确显示
- 代码结构清晰

**涉及文件:** `src/renderer/components/SystemManagementView.tsx`

---

## 阶段 3: 状态管理

### 3.1 扩展 webServiceSlice

- [ ] 添加 `activeVersion` 字段到状态
- [ ] 添加 `setActiveVersion` action
- [ ] 添加 `activeVersion` selector
- [ ] 更新 `ProcessInfo` 类型以包含版本信息

**验收标准:**
- 状态类型完整
- Selector 正确返回活动版本
- Action 正确更新状态

**涉及文件:** `src/renderer/store/slices/webServiceSlice.ts`

---

### 3.2 更新 webServiceSaga

- [ ] 添加获取活动版本的 saga
- [ ] 在启动前检查活动版本状态
- [ ] 处理版本相关的错误
- [ ] 监听版本变化事件

**验收标准:**
- Saga 正确处理版本检查
- 错误被正确捕获和传递
- 事件监听正确注册和清理

**涉及文件:** `src/renderer/store/sagas/webServiceSaga.ts`

---

### 3.3 添加 preload API

- [ ] 添加 `getActiveVersion` API
- [ ] 确保类型定义正确
- [ ] 添加事件监听器类型

**验收标准:**
- API 正确暴露到渲染进程
- 类型定义与主进程匹配

**涉及文件:** `src/preload/index.ts`

---

## 阶段 4: 国际化

### 4.1 添加翻译文本

- [ ] 添加版本相关的错误信息翻译（中英文）
- [ ] 添加依赖检查相关的提示文本
- [ ] 添加用户引导文案

**验收标准:**
- 所有用户可见文本都有翻译
- 翻译准确且自然

**涉及文件:**
- `src/renderer/i18n/locales/en-US/common.json`
- `src/renderer/i18n/locales/en-US/components.json`
- `src/renderer/i18n/locales/zh-CN/common.json`
- `src/renderer/i18n/locales/zh-CN/components.json`

---

## 阶段 5: 测试

### 5.1 单元测试

- [ ] 测试版本检查逻辑
- [ ] 测试依赖检查逻辑
- [ ] 测试状态更新逻辑

**验收标准:**
- 所有测试通过
- 覆盖率达到 80%

---

### 5.2 集成测试

- [ ] 测试完整启动流程
- [ ] 测试错误场景（无版本、缺少依赖）
- [ ] 测试版本切换场景

**验收标准:**
- 所有场景测试通过
- 用户体验符合预期

---

### 5.3 手动验证

- [ ] 验证正常启动流程
- [ ] 验证无版本时的行为
- [ ] 验证缺少依赖时的行为
- [ ] 验证版本切换后的行为

**验收标准:**
- 所有场景验证通过
- 无回归问题

---

## 完成标准

- [ ] 所有任务完成
- [ ] 所有测试通过
- [ ] 代码审查通过
- [ ] 无遗留技术债务标记
- [ ] 文档更新完成
