# 官方博客 RSS 订阅源集成 - 实施任务清单

本文档列出了实施"官方博客 RSS 订阅源集成"功能的详细任务清单。

## 任务依赖关系图

```
Phase 1: 准备工作
├── T1.1 安装 rss-parser 依赖
└── T1.2 定义 TypeScript 类型

Phase 2: 主进程开发
├── T2.1 创建 RSS Feed Manager
├── T2.2 实现 IPC 通道注册
└── T2.3 配置预加载脚本

Phase 3: 渲染进程状态管理
├── T3.1 创建 rssFeedSlice
└── T3.2 创建 rssFeedSaga

Phase 4: UI 组件开发
├── T4.1 创建 BlogFeedCard 组件
├── T4.2 集成到主页
└── T4.3 添加国际化翻译

Phase 5: 测试与验证
├── T5.1 功能测试
├── T5.2 错误处理测试
└── T5.3 国际化验证
```

---

## Phase 1: 准备工作

### T1.1 安装 rss-parser 依赖

**优先级**: 高
**预计工作量**: 5 分钟
**依赖**: 无

**描述**:
安装 `rss-parser` 库用于解析 RSS XML 数据。

**执行步骤**:
1. 运行安装命令：`npm install rss-parser`
2. 验证 package.json 中已添加依赖

**验收标准**:
- [ ] `rss-parser` 已添加到 package.json dependencies
- [ ] `npm install` 无错误完成

---

### T1.2 定义 TypeScript 类型

**优先级**: 高
**预计工作量**: 10 分钟
**依赖**: T1.1

**描述**:
定义 RSS 相关的 TypeScript 接口和类型。

**执行步骤**:
1. 创建文件 `src/main/types/rss-types.ts`
2. 定义 `RSSFeedItem` 接口
3. 定义 `RSSFeedCache` 接口

**代码位置**: `src/main/types/rss-types.ts` (新建)

**验收标准**:
- [ ] 类型定义文件已创建
- [ ] 类型包含所有必需字段
- [ ] 类型导出正确

---

## Phase 2: 主进程开发

### T2.1 创建 RSS Feed Manager

**优先级**: 高
**预计工作量**: 60 分钟
**依赖**: T1.2

**描述**:
创建单例模式的 RSS Feed Manager，负责获取、解析和缓存 RSS 数据。

**执行步骤**:
1. 创建 `src/main/rss-feed-manager.ts`
2. 实现单例模式（参考现有管理器如 `web-service-manager.ts`）
3. 实现 `fetchRSSFeed()` 方法 - 使用 axios 获取 RSS 数据
4. 实现 `parseRSSXML()` 方法 - 使用 rss-parser 解析 XML
5. 实现 `getCachedFeed()` 方法 - 从 electron-store 读取缓存
6. 实现 `refreshFeed()` 方法 - 获取并更新缓存
7. 实现 `startAutoRefresh()` 方法 - 设置 24 小时定时刷新
8. 实现 `getLastUpdateTime()` 方法 - 返回最后更新时间

**代码位置**: `src/main/rss-feed-manager.ts` (新建)

**验收标准**:
- [ ] 单例模式正确实现
- [ ] 成功从 `https://docs.hagicode.com/blog/rss.xml` 获取数据
- [ ] RSS XML 正确解析为 `RSSFeedItem[]`
- [ ] 数据正确缓存到 electron-store
- [ ] 自动刷新定时器正确设置

---

### T2.2 实现 IPC 通道注册

**优先级**: 高
**预计工作量**: 30 分钟
**依赖**: T2.1

**描述**:
在主进程注册 RSS 相关的 IPC 处理程序。

**执行步骤**:
1. 编辑 `src/main/index.ts`
2. 导入 `RssFeedManager`
3. 获取管理器实例
4. 注册 `rss-get-feed-items` 处理程序
5. 注册 `rss-refresh-feed` 处理程序
6. 注册 `rss-get-last-update` 处理程序

**代码位置**: `src/main/index.ts` (修改)

**验收标准**:
- [ ] 所有 IPC 通道已注册
- [ ] 通道正确调用管理器方法
- [ ] 错误处理已实现

---

### T2.3 配置预加载脚本

**优先级**: 高
**预计工作量**: 20 分钟
**依赖**: T2.2

**描述**:
在预加载脚本中暴露 RSS API 给渲染进程。

**执行步骤**:
1. 编辑 `src/preload/index.ts`
2. 在 `electronAPI` 对象中添加 RSS 方法
3. 添加类型定义（如需要）

**代码位置**: `src/preload/index.ts` (修改)

**验收标准**:
- [ ] RSS API 已暴露给渲染进程
- [ ] 类型定义正确
- [ ] 预加载脚本编译无错误

---

## Phase 3: 渲染进程状态管理

### T3.1 创建 rssFeedSlice

**优先级**: 高
**预计工作量**: 30 分钟
**依赖**: T2.3

**描述**:
创建 Redux Toolkit slice 管理 RSS 状态。

**执行步骤**:
1. 创建 `src/renderer/store/slices/rssFeedSlice.ts`
2. 定义状态接口：`items`, `loading`, `error`, `lastUpdate`
3. 实现 `setItems` reducer
4. 实现 `setLoading` reducer
5. 实现 `setError` reducer
6. 实现 `setLastUpdate` reducer

**代码位置**: `src/renderer/store/slices/rssFeedSlice.ts` (新建)

**验收标准**:
- [ ] Slice 正确导出
- [ ] Reducers 正确实现
- [ ] Actions 正确导出
- [ ] Slice 已添加到 store 配置

---

### T3.2 创建 rssFeedSaga

**优先级**: 高
**预计工作量**: 40 分钟
**依赖**: T3.1

**描述**:
创建 Redux Saga 处理 RSS 相关的异步操作。

**执行步骤**:
1. 创建 `src/renderer/store/sagas/rssFeedSaga.ts`
2. 实现 `fetchFeedItemsSaga` - 获取文章列表
3. 实现 `refreshFeedSaga` - 刷新 RSS 数据
4. 实现 `fetchLastUpdateSaga` - 获取最后更新时间
5. 注册 saga 监听器

**代码位置**: `src/renderer/store/sagas/rssFeedSaga.ts` (新建)

**验收标准**:
- [ ] Saga 正确监听 actions
- [ ] IPC 调用正确实现
- [ ] 状态更新正确
- [ ] 错误处理已实现
- [ ] Saga 已添加到 root saga

---

## Phase 4: UI 组件开发

### T4.1 创建 BlogFeedCard 组件

**优先级**: 高
**预计工作量**: 60 分钟
**依赖**: T3.2

**描述**:
创建博客文章展示卡片组件。

**执行步骤**:
1. 创建 `src/renderer/components/BlogFeedCard.tsx`
2. 使用 shadcn/ui Card 组件作为容器
3. 实现文章列表渲染（最多 5 条）
4. 实现每条文章的显示：标题、日期、摘要
5. 添加刷新按钮
6. 实现加载状态 UI
7. 实现错误状态 UI
8. 实现点击跳转功能
9. 应用国际化翻译

**代码位置**: `src/renderer/components/BlogFeedCard.tsx` (新建)

**UI 设计参考**:
```
┌─────────────────────────────────────────┐
│  📰 Hagicode 博客               [刷新]  │
├─────────────────────────────────────────┤
│  ◦ 产品发布：Hagicode v2.0 正式发布      │
│    2025-01-15                            │
├─────────────────────────────────────────┤
│  ◦ 教程：如何配置自定义包源              │
│    2025-01-10                            │
├─────────────────────────────────────────┤
│  ◦ 更新日志：版本 v1.9.5 修复内容        │
│    2025-01-05                            │
├─────────────────────────────────────────┤
│  ◦ 技术文章：Electron 应用性能优化实践   │
│    2024-12-28                            │
├─────────────────────────────────────────┤
│  ◦ 公告：服务器维护通知                  │
│    2024-12-20                            │
└─────────────────────────────────────────┘
```

**验收标准**:
- [ ] 组件正确渲染
- [ ] 显示最多 5 条文章
- [ ] 加载状态显示正确
- [ ] 错误状态显示正确
- [ ] 刷新按钮功能正常
- [ ] 点击文章正确跳转
- [ ] 国际化文本显示正确

---

### T4.2 集成到主页

**优先级**: 高
**预计工作量**: 15 分钟
**依赖**: T4.1

**描述**:
将 BlogFeedCard 组件集成到应用主页。

**执行步骤**:
1. 编辑 `src/renderer/components/SystemManagementView.tsx`
2. 导入 `BlogFeedCard` 组件
3. 导入 `useAppDispatch` 和 `useAppSelector`
4. 在组件挂载时 dispatch 获取 RSS 数据的 action
5. 在适当位置添加 `BlogFeedCard` 组件

**代码位置**: `src/renderer/components/SystemManagementView.tsx` (修改)

**验收标准**:
- [ ] BlogFeedCard 已添加到主页
- [ ] 组件在挂载时自动加载数据
- [ ] 布局正确，不影响其他组件

---

### T4.3 添加国际化翻译

**优先级**: 中
**预计工作量**: 15 分钟
**依赖**: T4.1

**描述**:
添加中英文翻译支持。

**执行步骤**:
1. 编辑 `src/renderer/i18n/locales/zh-CN/components.json`
2. 添加以下翻译键：
   - `blogFeed.title` - "Hagicode 博客"
   - `blogFeed.refresh` - "刷新"
   - `blogFeed.loading` - "加载中..."
   - `blogFeed.error` - "加载失败，请稍后重试"
   - `blogFeed.noArticles` - "暂无文章"
   - `blogFeed.lastUpdate` - "最后更新：{date}"

3. 编辑 `src/renderer/i18n/locales/en-US/components.json`
4. 添加对应的英文翻译

**代码位置**:
- `src/renderer/i18n/locales/zh-CN/components.json` (修改)
- `src/renderer/i18n/locales/en-US/components.json` (修改)

**验收标准**:
- [ ] 中英文翻译已添加
- [ ] 组件正确使用翻译键
- [ ] 语言切换时翻译正确更新

---

## Phase 5: 测试与验证

### T5.1 功能测试

**优先级**: 高
**预计工作量**: 30 分钟
**依赖**: T4.2

**描述**:
验证核心功能正常工作。

**测试用例**:
- [ ] 应用启动后自动加载 RSS 数据
- [ ] 博客文章正确显示（标题、日期、摘要）
- [ ] 最多显示 5 条文章
- [ ] 点击文章在浏览器中打开
- [ ] 刷新按钮能手动更新数据
- [ ] 最后更新时间正确显示

---

### T5.2 错误处理测试

**优先级**: 高
**预计工作量**: 20 分钟
**依赖**: T5.1

**描述**:
验证错误场景的处理。

**测试用例**:
- [ ] 网络断开时显示错误提示
- [ ] RSS 源不可用时显示友好消息
- [ ] RSS 格式错误时有降级处理
- [ ] 加载状态正确显示

---

### T5.3 国际化验证

**优先级**: 中
**预计工作量**: 10 分钟
**依赖**: T5.1

**描述**:
验证国际化功能。

**测试用例**:
- [ ] 中文界面翻译正确
- [ ] 英文界面翻译正确
- [ ] 语言切换时组件正确更新

---

## 总结

**总任务数**: 15
**预计总工作量**: 约 5 小时

**关键里程碑**:
- M1: 主进程 RSS 管理器完成 (T2.1)
- M2: IPC 通信层完成 (T2.3)
- M3: 状态管理层完成 (T3.2)
- M4: UI 组件完成 (T4.2)
- M5: 全部功能验证通过 (T5.2)

**并行执行机会**:
- T4.3 (国际化) 可以与 T4.2 (集成到主页) 并行
- T5.1、T5.2、T5.3 (测试任务) 可以并行执行
