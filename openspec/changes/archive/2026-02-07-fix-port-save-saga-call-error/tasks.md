# Tasks: Fix Port Save Saga Call Error

## Overview

修复端口保存功能的 Redux Saga 调用错误,通过在 preload 脚本中暴露缺失的 IPC API。

---

## Task 1: 在 Preload 脚本中暴露 setWebServiceConfig API

**Priority:** High
**Estimated Complexity:** Low

### Description

在 `src/preload/index.ts` 的 electronAPI 对象中添加 `setWebServiceConfig` 方法,将渲染进程的配置更新请求通过 IPC 传递给主进程。

### Implementation Steps

1. 打开 `src/preload/index.ts`
2. 在 Web Service Management APIs 部分(约第 18-31 行)添加以下代码:
   ```typescript
   setWebServiceConfig: (config) => ipcRenderer.invoke('set-web-service-config', config),
   ```
3. 确保添加位置与其他 Web Service API 保持一致的组织结构

### Acceptance Criteria

- [ ] `setWebServiceConfig` 方法已添加到 electronAPI 对象
- [ ] 方法位于 Web Service Management APIs 部分
- [ ] 代码格式符合项目规范

---

## Task 2: 验证 TypeScript 类型声明

**Priority:** Medium
**Estimated Complexity:** Low

### Description

确保 preload 脚本的修改与 saga 中的全局类型声明保持一致。

### Implementation Steps

1. 检查 `src/renderer/store/sagas/webServiceSaga.ts` 中的类型声明(第 32 行)
2. 确认 preload 实现与类型声明的参数和返回值类型匹配

### Acceptance Criteria

- [ ] preload 实现与类型声明一致
- [ ] 无 TypeScript 类型错误

---

## Task 3: 手动测试端口保存功能

**Priority:** High
**Estimated Complexity:** Medium

### Description

验证修复后的端口保存功能可以正常工作。

### Test Cases

1. **正常端口保存**
   - 打开应用首页
   - 修改端口号为有效值(如 8081)
   - 保存设置
   - 验证无错误抛出
   - 重启应用,确认端口配置已持久化

2. **边界值测试**
   - 测试最小有效端口(1024)
   - 测试最大有效端口(65535)
   - 测试无效端口(1023, 65536),确认验证错误正确显示

3. **服务运行时保存**
   - 启动 Web 服务
   - 修改端口
   - 验证错误提示正确显示(端口变更需要重启服务)

### Acceptance Criteria

- [ ] 所有测试用例通过
- [ ] 无运行时错误
- [ ] 用户界面反馈正确

---

## Task 4: 代码审查和清理

**Priority:** Low
**Estimated Complexity:** Low

### Description

审查相关代码,确保没有其他类似的缺失 API 暴露问题。

### Implementation Steps

1. 检查 `src/renderer/store/sagas/webServiceSaga.ts` 中所有使用的 `window.electronAPI` 方法
2. 逐一确认这些方法都在 `src/preload/index.ts` 中暴露
3. 如发现其他缺失,记录到技术债务或创建新提案

### Acceptance Criteria

- [ ] 所有 saga 中使用的 API 都已在 preload 中暴露
- [ ] 缺失的 API(如有)已记录

---

## Task 5: 更新相关文档(如需要)

**Priority:** Low
**Estimated Complexity:** Low

### Description

如果项目中存在 IPC API 清单或开发者文档,更新相关内容。

### Implementation Steps

1. 检查是否存在 API 文档
2. 如存在,添加 `setWebServiceConfig` API 说明
3. 如不存在,跳过此任务

### Acceptance Criteria

- [ ] API 文档已更新(如适用)
