# Change: Fix Missing Imports in Web Service Stop Saga

## Why

用户在停止 Web 服务时遇到运行时错误 (`ReferenceError: setUrl is not defined`)。该错误发生在 `src/renderer/store/sagas/webServiceSaga.ts` 的 `stopWebServiceSaga` 函数中，原因是代码使用了 `setUrl` 和 `setPid` 两个 action creators，但这两个函数在文件顶部未被导入。这导致停止 Web 服务功能完全无法正常工作。

## What Changes

- 修复 `src/renderer/store/sagas/webServiceSaga.ts` 中的导入语句，添加缺失的 `setUrl` 和 `setPid` action creators
- 确保停止 Web 服务时能正确重置 URL 和 PID 状态

## Impact

- Affected specs: `electron-app` (Server Control requirement)
- Affected code: `src/renderer/store/sagas/webServiceSaga.ts:1-17` (import statements), `src/renderer/store/sagas/webServiceSaga.ts:141-142` (stopWebServiceSaga function)
- **No breaking changes** - 修复现有行为，恢复停止服务的预期功能
- 低风险 - 仅添加缺失的导入，不改变现有逻辑
- 向后兼容 - 不影响其他功能
