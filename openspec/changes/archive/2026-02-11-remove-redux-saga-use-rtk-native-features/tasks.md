# 移除 Redux Saga 使用 Redux Toolkit 原生功能 - 任务清单

## 阶段 1: 准备工作

### 1.1 创建基础架构
- [ ] 创建 `src/renderer/store/thunks/` 目录结构
- [ ] 创建 `src/renderer/store/listenerMiddleware.ts` 文件
- [ ] 设置 Listener Middleware 基础配置

### 1.2 环境准备
- [ ] 创建新的功能分支进行迁移
- [ ] 确认现有测试覆盖情况
- [ ] 记录当前所有异步操作流程

## 阶段 2: 低复杂度模块迁移

### 2.1 i18n 模块迁移
- [ ] 创建 `src/renderer/store/thunks/i18nThunks.ts`
- [ ] 实现 `changeLanguage` Thunk（替换 `i18nSaga/changeLanguageSaga`）
- [ ] 实现 `loadInitialLanguage` Thunk（替换 `i18nSaga/loadInitialLanguageSaga`）
- [ ] 更新 `i18nSlice.ts` 添加 extraReducers 处理 Thunk action
- [ ] 更新组件中的 dispatch 调用

### 2.2 view 模块迁移
- [ ] 将视图切换逻辑简化为纯 reducer 操作
- [ ] 移除 `viewSaga` 相关代码
- [ ] 更新组件中的视图切换逻辑

### 2.3 license 模块迁移
- [ ] 创建 `src/renderer/store/thunks/licenseThunks.ts`
- [ ] 实现 `fetchLicense` Thunk（替换 `licenseSaga/fetchLicense`）
- [ ] 实现 `saveLicense` Thunk（替换 `licenseSaga/saveLicense`）
- [ ] 更新 `licenseSlice.ts` 添加 extraReducers

### 2.4 rssFeed 模块迁移
- [ ] 创建 `src/renderer/store/thunks/rssFeedThunks.ts`
- [ ] 实现 `fetchFeedItems` Thunk（替换 `rssFeedSaga/fetchFeedItemsSaga`）
- [ ] 实现 `refreshFeed` Thunk（替换 `rssFeedSaga/refreshFeedSaga`）
- [ ] 实现 `fetchLastUpdate` Thunk（替换 `rssFeedSaga/fetchLastUpdateSaga`）
- [ ] 更新 `rssFeedSlice.ts` 添加 extraReducers

## 阶段 3: 中复杂度模块迁移

### 3.1 packageSource 模块迁移
- [ ] 创建 `src/renderer/store/thunks/packageSourceThunks.ts`
- [ ] 实现 `loadSourceConfig` Thunk
- [ ] 实现 `loadAllSourceConfigs` Thunk
- [ ] 实现 `setSourceConfig` Thunk
- [ ] 实现 `switchSource` Thunk
- [ ] 实现 `validateConfig` Thunk
- [ ] 实现 `scanFolder` Thunk
- [ ] 实现 `fetchGithub` Thunk
- [ ] 实现 `fetchHttpIndex` Thunk
- [ ] 更新 `packageSourceSlice.ts` 添加 extraReducers
- [ ] 更新组件中的 dispatch 调用

## 阶段 4: 高复杂度模块迁移

### 4.1 webService 模块迁移
- [ ] 创建 `src/renderer/store/thunks/webServiceThunks.ts`
- [ ] 实现 `startWebService` Thunk（含强制启动逻辑）
- [ ] 实现 `stopWebService` Thunk
- [ ] 实现 `restartWebService` Thunk
- [ ] 实现 `fetchWebServiceStatus` Thunk
- [ ] 实现 `fetchWebServiceVersion` Thunk
- [ ] 实现 `checkPackageInstallation` Thunk
- [ ] 实现 `installWebServicePackage` Thunk（含确认对话框逻辑）
- [ ] 实现 `confirmInstallAndStop` Thunk
- [ ] 实现 `fetchAvailableVersions` Thunk
- [ ] 实现 `fetchPlatform` Thunk
- [ ] 实现 `updateWebServicePort` Thunk
- [ ] 实现 `fetchActiveVersion` Thunk
- [ ] 实现 `confirmStartWithWarning` Thunk
- [ ] 更新 `webServiceSlice.ts` 添加 extraReducers
- [ ] 设置 Listener Middleware 处理状态轮询
- [ ] 设置 Listener Middleware 处理安装进度
- [ ] 设置 Listener Middleware 处理版本变更通知
- [ ] 迁移初始化逻辑到 Thunk

### 4.2 dependency 模块迁移
- [ ] 创建 `src/renderer/store/thunks/dependencyThunks.ts`
- [ ] 实现 `fetchDependencies` Thunk
- [ ] 实现 `installDependency` Thunk
- [ ] 实现 `installFromManifest` Thunk
- [ ] 实现 `installSingleDependency` Thunk（含进度监听）
- [ ] 实现 `checkDependenciesAfterInstall` Thunk
- [ ] 实现 `executeInstallCommands` Thunk
- [ ] 更新 `dependencySlice.ts` 添加 extraReducers
- [ ] 设置 Listener Middleware 处理安装进度事件
- [ ] 设置 Listener Middleware 处理安装命令进度
- [ ] 迁移初始化逻辑到 Thunk

## 阶段 5: Store 配置更新

### 5.1 移除 Saga 中间件
- [ ] 从 `src/renderer/store/index.ts` 移除 `createSagaMiddleware` 导入
- [ ] 移除 `sagaMiddleware` 实例化
- [ ] 移除 `serializableCheck` 中的 Saga 相关配置
- [ ] 移除所有 `sagaMiddleware.run()` 调用
- [ ] 集成 Listener Middleware 到 store

### 5.2 更新初始化逻辑
- [ ] 替换 Saga 初始化 dispatch 为 Thunk 调用
- [ ] 确保所有模块按正确顺序初始化

## 阶段 6: 清理工作

### 6.1 删除 Saga 代码
- [ ] 删除 `src/renderer/store/sagas/` 整个目录
- [ ] 删除 `src/renderer/store/sagas/` 下所有文件：
  - [ ] `webServiceSaga.ts`
  - [ ] `dependencySaga.ts`
  - [ ] `i18nSaga.ts`
  - [ ] `viewSaga.ts`
  - [ ] `licenseSaga.ts`
  - [ ] `packageSourceSaga.ts`
  - [ ] `rssFeedSaga.ts`

### 6.2 移除 npm 依赖
- [ ] 从 `package.json` 移除 `redux-saga` 依赖
- [ ] 运行 `npm install` 清理依赖

### 6.3 代码清理
- [ ] 移除未使用的类型导入
- [ ] 移除未使用的 action creators
- [ ] 清理注释和文档

## 阶段 7: 验证测试

### 7.1 类型检查
- [ ] 运行 `npm run build:tsc:check` 确保无类型错误
- [ ] 检查所有 Thunk 的类型定义

### 7.2 功能测试
- [ ] 测试 Web 服务启动/停止/重启
- [ ] 测试依赖安装流程
- [ ] 测试包源配置切换
- [ ] 测试语言切换
- [ ] 测试视图切换
- [ ] 测试许可证管理
- [ ] 测试 RSS 订阅获取

### 7.3 打包验证
- [ ] 运行 `npm run build:prod`
- [ ] 验证打包体积减少约 50KB
- [ ] 测试打包后的应用功能

## 阶段 8: 文档更新

### 8.1 更新开发文档
- [ ] 更新状态管理架构说明
- [ ] 添加 Thunk 使用示例
- [ ] 添加 Listener Middleware 使用说明

### 8.2 代码注释
- [ ] 为复杂 Thunk 添加注释
- [ ] 更新 slice 文件中的 extraReducers 说明

## 执行顺序建议

1. **第一阶段（低风险）**：先迁移 i18n、view、license、rssFeed 模块
2. **第二阶段（中风险）**：迁移 packageSource 模块
3. **第三阶段（高风险）**：迁移 webService 和 dependency 模块
4. **验证阶段**：每个阶段完成后进行完整测试

## 预估工作量

| 阶段 | 预估工时 |
|------|----------|
| 阶段 1: 准备工作 | 2h |
| 阶段 2: 低复杂度模块迁移 | 4h |
| 阶段 3: 中复杂度模块迁移 | 4h |
| 阶段 4: 高复杂度模块迁移 | 12h |
| 阶段 5: Store 配置更新 | 2h |
| 阶段 6: 清理工作 | 1h |
| 阶段 7: 验证测试 | 4h |
| 阶段 8: 文档更新 | 2h |
| **总计** | **31h** |

## 注意事项

1. **保持功能等价**：迁移后的功能必须与原 Saga 实现完全一致
2. **错误处理**：确保所有错误场景都被正确处理
3. **状态一致性**：注意 Redux 状态更新的时序问题
4. **事件监听清理**：Listener Middleware 中的监听器需要正确清理
5. **渐进式迁移**：建议按模块逐步迁移，每完成一个模块就进行测试
