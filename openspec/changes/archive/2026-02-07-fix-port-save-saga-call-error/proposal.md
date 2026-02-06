# Proposal: Fix Port Save Saga Call Error

## Summary

修复用户在首页尝试保存端口设置时出现的运行时错误。该错误由 `webServiceSaga.ts` 中的 `updateWebServicePortSaga` 函数调用未定义的 IPC API 导致。

## Problem

当用户在首页尝试保存端口设置时,应用抛出以下运行时错误:

```
Update port saga error: Error: call: argument fn is undefined or null
    at updateWebServicePortSaga (webServiceSaga.ts:273:70)
```

### Root Cause

经过代码分析,发现问题的根本原因是:

1. **主进程 IPC Handler 存在**: `src/main/main.ts:361` 定义了 `set-web-service-config` IPC handler
2. **Saga 代码调用该 API**: `src/renderer/store/sagas/webServiceSaga.ts:275` 调用 `window.electronAPI.setWebServiceConfig`
3. **Preload 脚本未暴露**: `src/preload/index.ts` 中**未暴露** `setWebServiceConfig` API 到渲染进程

这导致 `window.electronAPI.setWebServiceConfig` 为 `undefined`,Redux Saga 的 `call()` effect 验证失败。

## Solution

### Approach

在 preload 脚本中添加缺失的 `setWebServiceConfig` API 暴露,确保渲染进程可以通过 IPC 调用主进程的配置更新功能。

### Implementation

修改 `src/preload/index.ts`,在 electronAPI 对象中添加:

```typescript
setWebServiceConfig: (config) => ipcRenderer.invoke('set-web-service-config', config),
```

该修改需要放置在 Web Service Management APIs 部分,与其他相关 API 保持一致。

## Scope

### In Scope
- 在 preload 脚本中暴露 `setWebServiceConfig` API
- 验证端口保存功能正常工作

### Out of Scope
- 修改主进程 IPC handler (已存在,无需修改)
- 修改 saga 逻辑 (调用代码正确,无需修改)
- 添加新的端口配置功能

## Impact

### User Impact
- 用户可以成功保存端口配置变更
- 首页设置功能完全可用

### Technical Impact
- 修复渲染进程与主进程之间的 IPC 通信链路
- 消除 Redux Saga 错误

## Risk Assessment

**Risk Level: Low**

- 修改范围小,仅涉及单个文件的添加
- 主进程 IPC handler 已存在并经过验证
- 不涉及业务逻辑变更
- 向后兼容,不影响现有功能

## Dependencies

None. This is an independent fix.

## Success Criteria

1. Preload 脚本成功暴露 `setWebServiceConfig` API
2. 用户可以在首页保存端口设置
3. 无运行时错误抛出
4. 配置变更正确持久化到文件系统

## Related Issues

None.
