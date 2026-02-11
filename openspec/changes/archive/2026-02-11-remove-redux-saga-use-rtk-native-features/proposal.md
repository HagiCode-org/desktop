# 移除 Redux Saga 使用 Redux Toolkit 原生功能

## 概述

移除项目中的 Redux Saga 中间件，采用 Redux Toolkit 原生的 `createAsyncThunk` 和 `createListenerMiddleware` 替代。此变更旨在简化状态管理架构，降低学习曲线，并改善开发调试体验。

## 背景

### 现状
- 当前使用 Redux Toolkit 2.5.0 配合 Redux Saga 1.4.2
- 7 个 Saga 文件共约 2000 行代码
- 主要处理异步操作、事件监听和副作用管理

### 问题分析
1. **开发体验问题**：Generator 函数的调试复杂，栈追踪不直观
2. **学习曲线陡峭**：需要理解 effects（`call`、`put`、`take`、`fork` 等）概念
3. **冗余复杂性**：大部分场景不需要 Saga 提供的复杂功能
4. **打包体积**：约 50KB 的额外依赖

### 现有 Saga 代码分布
| Saga 文件 | 行数 | 主要功能 | 复杂度 |
|-----------|------|----------|--------|
| `webServiceSaga.ts` | ~580 | 服务启停、安装、状态监听 | 高 |
| `dependencySaga.ts` | ~600 | 依赖检查、安装、进度监听 | 高 |
| `packageSourceSaga.ts` | ~400 | 包源配置、版本获取 | 中 |
| `licenseSaga.ts` | ~110 | 许可证获取、保存 | 低 |
| `i18nSaga.ts` | ~75 | 语言切换 | 低 |
| `viewSaga.ts` | ~55 | 视图切换 | 低 |
| `rssFeedSaga.ts` | ~120 | RSS 订阅获取 | 低 |

## 解决方案

### 技术迁移策略

#### 1. 异步操作处理 - 使用 `createAsyncThunk`
将所有异步操作迁移到 `createAsyncThunk`，自动处理 `pending`、`fulfilled`、`rejected` 状态。

**迁移映射：**
| Saga 模式 | RTK Thunk 等价方案 |
|-----------|-------------------|
| `yield call(api)` | 直接 async/await 调用 |
| `yield put(action)` | `dispatch(action)` 或 Thunk 内部调用 |
| `try/catch` | `rejectWithValue` 处理错误 |
| `takeEvery` | 每次调用 Thunk 即可 |
| `takeLatest` | Thunk 内部实现取消逻辑 |

#### 2. 事件监听 - 使用 `createListenerMiddleware`
对于需要响应 Redux 状态变化的副作用，使用 `createListenerMiddleware`。

**使用场景：**
- Web 服务状态变化监听
- 依赖安装进度监听
- 版本变更通知

#### 3. 初始化逻辑 - 使用启动 Thunk
将 Saga 的初始化逻辑（`initialize*Saga`）迁移为启动时调用的 Thunk。

#### 4. 复杂流程 - 组件内 `useEffect`
对于与 UI 紧密相关的副作用，迁移到组件的 `useEffect` hooks 中。

### 迁移范围

#### 需要迁移的 Saga 功能

| 模块 | Saga 功能 | 迁移方案 |
|------|-----------|----------|
| **webService** | 服务启停、安装 | Thunks |
| **webService** | 状态轮询/监听 | Listener Middleware + useEffect |
| **webService** | 安装进度监听 | Listener Middleware |
| **dependency** | 依赖检查/安装 | Thunks |
| **dependency** | 安装进度监听 | Listener Middleware |
| **i18n** | 语言切换 | Thunk + localStorage |
| **view** | 视图切换 | 简化为 reducer 逻辑 |
| **license** | 许可证 CRUD | Thunks |
| **packageSource** | 配置管理、版本获取 | Thunks |
| **rssFeed** | RSS 获取 | Thunks |

#### 需要修改的文件
- **删除：** `src/renderer/store/sagas/` 整个目录
- **修改：** `src/renderer/store/index.ts`
- **新建：** `src/renderer/store/thunks/` 目录下创建各模块 Thunks
- **新建：** `src/renderer/store/listenerMiddleware.ts`

### 依赖变更

#### 移除
```json
{
  "redux-saga": "^1.4.2"
}
```

#### 新增
无需新增依赖，`createAsyncThunk` 和 `createListenerMiddleware` 为 Redux Toolkit 内置功能。

## 影响评估

### 正面影响
1. **打包体积减少**：约 50KB
2. **代码简化**：消除 Generator 函数和 effects 概念
3. **调试改善**：同步风格的代码，更好的栈追踪
4. **类型安全**：更好的 TypeScript 类型推断
5. **维护成本**：降低团队学习曲线

### 潜在风险
1. **测试重写**：现有 Saga 测试需要重写（如有）
2. **功能回归**：需全面测试所有异步操作流程
3. **状态监听复杂度**：部分监听逻辑可能需要重新设计

### 受影响的功能模块
- Web 服务管理（启动/停止/重启）
- 依赖管理（检查/安装）
- 国际化切换
- 视图状态管理
- 许可证管理
- 包源配置管理
- RSS 订阅

## 实施计划

详见 `tasks.md`。

## 验收标准

1. 所有现有功能正常工作
2. 无 TypeScript 类型错误
3. 打包体积减少约 50KB
4. 所有单元测试通过（如存在）
5. 手动测试验证所有异步操作流程

## 回滚方案

如遇重大问题，可从 git 历史恢复 `redux-saga` 实现。建议在单独分支进行迁移，确保主分支稳定。
