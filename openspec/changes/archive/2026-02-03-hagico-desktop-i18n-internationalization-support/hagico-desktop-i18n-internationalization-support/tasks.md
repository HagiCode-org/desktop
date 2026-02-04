# 国际化支持实施任务清单

本文档列出了实现 Hagico Desktop 国际化支持所需的全部任务，按优先级和依赖关系组织。

## 阶段 1：基础设施搭建

### 1.1 创建 i18n 配置和初始化

- [ ] **创建 i18n 目录结构**
  - 路径：`src/renderer/i18n/`
  - 子目录：`locales/zh-CN/`、`locales/en-US/`
  - 验证：目录结构符合设计规范

- [ ] **编写 i18next 配置文件**
  - 文件：`src/renderer/i18n/config.ts`
  - 内容：定义语言代码、回退语言、命名空间等配置
  - 验证：配置项符合 i18next 最佳实践

- [ ] **创建 i18n 实例**
  - 文件：`src/renderer/i18n/index.ts`
  - 功能：导出配置好的 i18n 实例
  - 验证：实例可正常导入和使用

- [ ] **创建翻译资源文件模板**
  - 文件：`src/renderer/i18n/locales/zh-CN/common.json`
  - 文件：`src/renderer/i18n/locales/zh-CN/components.json`
  - 文件：`src/renderer/i18n/locales/zh-CN/pages.json`
  - 文件：`src/renderer/i18n/locales/en-US/common.json`（预留）
  - 验证：JSON 格式正确，包含基础结构

### 1.2 Redux 状态管理集成

- [ ] **创建 i18n slice**
  - 文件：`src/renderer/store/slices/i18nSlice.ts`
  - 状态：`currentLanguage`、`availableLanguages`、`isLoading`
  - actions：`setCurrentLanguage`、`loadAvailableLanguages`
  - 验证：Redux DevTools 中可见 i18n state

- [ ] **集成 i18n reducer 到 store**
  - 文件：`src/renderer/store/index.ts`
  - 操作：将 i18nReducer 添加到根 reducer
  - 验证：应用中可访问 i18n state

- [ ] **创建语言选择 Saga（可选）**
  - 文件：`src/renderer/store/sagas/i18nSaga.ts`
  - 功能：处理语言切换的异步操作
  - 验证：Saga 正确监听相关 actions

## 阶段 2：文本资源提取和翻译

### 2.1 核心组件文本提取

#### PackageManagementCard 组件
- [ ] **提取 PackageManagementCard 文本**
  - 文件：`src/renderer/components/PackageManagementCard.tsx`
  - 提取项：标题、描述、按钮标签、状态文本、提示信息
  - 验证：所有文本提取完整，无遗漏

- [ ] **创建翻译键并翻译**
  - 文件：`src/renderer/i18n/locales/zh-CN/components.json`
  - 键名：`packageManagement.*`
  - 验证：翻译准确，符合中文表达习惯

#### WebServiceStatusCard 组件
- [ ] **提取 WebServiceStatusCard 文本**
  - 文件：`src/renderer/components/WebServiceStatusCard.tsx`
  - 提取项：所有硬编码英文文本
  - 验证：提取完整

- [ ] **创建翻译键并翻译**
  - 文件：`src/renderer/i18n/locales/zh-CN/components.json`
  - 键名：`webServiceStatus.*`
  - 验证：翻译准确

### 2.2 通用文本提取

- [ ] **提取通用按钮文本**
  - 文件：`src/renderer/i18n/locales/zh-CN/common.json`
  - 内容：确认、取消、保存、删除、编辑、关闭等
  - 验证：覆盖所有常用按钮

- [ ] **提取状态标识文本**
  - 文件：`src/renderer/i18n/locales/zh-CN/common.json`
  - 内容：加载中、成功、失败、警告、信息等
  - 验证：状态描述完整

- [ ] **提取表单相关文本**
  - 文件：`src/renderer/i18n/locales/zh-CN/common.json`
  - 内容：必填、可选、占位符、验证错误等
  - 验证：表单场景覆盖完整

### 2.3 其他组件文本提取（按优先级）

- [ ] **提取 UI 组件库文本**
  - shadcn/ui 组件的默认文本（如有）
  - 验证：组件库文本本地化

- [ ] **提取次要功能组件文本**
  - 其他 27 个组件的文本提取
  - 验证：按组件重要性逐步完成

## 阶段 3：组件迁移

### 3.1 核心组件迁移

- [ ] **迁移 PackageManagementCard**
  - 文件：`src/renderer/components/PackageManagementCard.tsx`
  - 操作：导入 `useTranslation`，替换所有硬编码文本
  - 验证：组件功能正常，界面显示中文

- [ ] **迁移 WebServiceStatusCard**
  - 文件：`src/renderer/components/WebServiceStatusCard.tsx`
  - 操作：同上
  - 验证：组件功能正常，界面显示中文

### 3.2 其他组件迁移

- [ ] **迁移对话框和弹窗组件**
  - 识别所有 Dialog、Alert 组件
  - 逐个迁移
  - 验证：对话框内容正确显示

- [ ] **迁移表单组件**
  - 识别所有表单相关组件
  - 逐个迁移
  - 验证：表单标签和提示正确

- [ ] **迁移剩余组件**
  - 按优先级顺序迁移其他 25 个组件
  - 验证：每个组件迁移后功能正常

### 3.3 应用入口集成

- [ ] **在应用入口初始化 i18n**
  - 文件：`src/renderer/App.tsx` 或 `src/renderer/main.tsx`
  - 操作：导入并初始化 i18n 实例
  - 验证：应用启动时 i18n 正确初始化

- [ ] **包裹 I18nextProvider**
  - 文件：`src/renderer/App.tsx`
  - 操作：使用 I18nextProvider 包裹应用根组件
  - 验证：所有子组件可访问 i18n

## 阶段 4：语言切换功能

### 4.1 语言选择器组件开发

- [ ] **创建语言选择器组件**
  - 文件：`src/renderer/components/settings/LanguageSelector.tsx`
  - UI：下拉选择器，显示语言名称和代码
  - 验证：组件渲染正常

- [ ] **集成 Redux state**
  - 操作：从 i18nSlice 读取当前语言和可用语言列表
  - 验证：选择器显示正确的当前语言

- [ ] **实现语言切换逻辑**
  - 操作：调用 `i18n.changeLanguage` 和 Redux action
  - 验证：切换后界面立即更新

### 4.2 持久化集成

- [ ] **定义 Electron Store 配置**
  - 文件：`src/main/store.ts` 或相关配置文件
  - 键名：`appSettings.language`
  - 默认值：`'zh-CN'`
  - 验证：store schema 正确

- [ ] **实现读取语言偏好**
  - 文件：`src/renderer/store/sagas/i18nSaga.ts` 或相关文件
  - 操作：应用启动时从 store 读取语言设置
  - 验证：应用启动时使用上次选择的语言

- [ ] **实现保存语言偏好**
  - 操作：语言切换时保存到 electron-store
  - 验证：应用重启后语言偏好保持

### 4.3 集成到设置界面

- [ ] **在设置页面添加语言选项**
  - 文件：设置页面组件（需确认具体文件）
  - 操作：添加 LanguageSelector 组件
  - 验证：语言选择器在设置中可见且功能正常

- [ ] **添加设置说明文本**
  - 文件：`src/renderer/i18n/locales/zh-CN/pages.json`
  - 内容：语言设置的描述和提示
  - 验证：说明文本清晰易懂

## 阶段 5：测试与优化

### 5.1 功能测试

- [ ] **测试语言切换功能**
  - 操作：在语言选择器中切换语言
  - 验证：所有组件文本立即更新，无遗漏

- [ ] **测试持久化功能**
  - 操作：切换语言后重启应用
  - 验证：应用使用重启前选择的语言

- [ ] **测试回退机制**
  - 操作：使用不完整的翻译资源
  - 验证：正确回退到默认语言或英文

### 5.2 视觉测试

- [ ] **测试中文界面布局**
  - 操作：切换到中文界面
  - 验证：无文本溢出、无布局错位、无字体渲染问题

- [ ] **测试不同屏幕尺寸**
  - 操作：在不同分辨率下查看中文界面
  - 验证：响应式布局正常工作

- [ ] **测试字体显示**
  - 验证：中文字体正确渲染，无乱码

### 5.3 性能测试

- [ ] **测量语言切换性能**
  - 操作：使用 Performance API 测量切换耗时
  - 验证：切换时间 < 100ms

- [ ] **测量初始加载性能**
  - 操作：对比国际化前后的应用启动时间
  - 验证：启动时间增加 < 10%

- [ ] **测量内存占用**
  - 操作：使用 Chrome DevTools Memory profiler
  - 验证：内存增加 < 100KB

### 5.4 翻译质量检查

- [ ] **人工审校所有翻译**
  - 操作：逐条检查翻译的准确性和自然度
  - 验证：无错误、无生硬表达

- [ ] **术语一致性检查**
  - 操作：检查技术术语在不同位置的翻译是否一致
  - 验证：术语使用统一

- [ ] **上下文适配性检查**
  - 操作：检查翻译在不同上下文中的适配性
  - 验证：翻译符合具体使用场景

### 5.5 代码质量检查

- [ ] **TypeScript 类型检查**
  - 操作：运行 `npm run build:tsc:check`
  - 验证：无类型错误

- [ ] **代码审查**
  - 操作：代码审查国际化相关代码
  - 验证：符合项目代码规范

- [ ] **移除硬编码文本检查**
  - 操作：搜索代码中的硬编码英文文本
  - 验证：所有应翻译的文本已迁移

## 阶段 6：文档和发布准备

### 6.1 开发者文档

- [ ] **编写国际化开发指南**
  - 文件：`docs/i18n-guide.md`
  - 内容：如何添加新翻译、如何新建组件的国际化
  - 验证：文档完整、易懂

- [ ] **更新项目 README**
  - 操作：添加国际化支持说明
  - 验证：README 反映当前功能

### 6.2 用户文档

- [ ] **编写语言切换使用说明**
  - 内容：如何切换语言、支持的语言列表
  - 验证：说明清晰

### 6.3 发布准备

- [ ] **创建版本变更日志**
  - 操作：在 CHANGELOG 中记录国际化功能
  - 验证：变更日志准确描述新功能

- [ ] **准备发布说明**
  - 内容：功能介绍、使用方法、已知问题
  - 验证：发布说明完整

## 并行化机会

以下任务可以并行执行以加快进度：

### 并行任务组 A：组件文本提取
- PackageManagementCard 文本提取
- WebServiceStatusCard 文本提取
- 其他组件文本提取（可多人分工）

### 并行任务组 B：组件迁移
- 不同组件的迁移可以并行进行
- 前提：已提取的翻译资源已准备好

### 并行任务组 C：翻译工作
- 初次翻译
- 审校和优化
- 可由不同人员或工具并行处理

## 依赖关系

### 关键路径
```
基础设施搭建 → 文本资源提取 → 组件迁移 → 语言切换功能 → 测试 → 发布
```

### 依赖说明

1. **Redux 状态管理** 必须在 **语言选择器组件** 之前完成
2. **文本资源提取** 必须在 **组件迁移** 之前完成
3. **i18n 初始化** 必须在 **任何组件迁移** 之前完成
4. **持久化集成** 可以与 **语言选择器开发** 并行进行
5. **测试** 必须在所有开发任务完成后进行

## 时间估算

| 阶段 | 任务数 | 预估工作量（小时） |
|------|--------|-------------------|
| 阶段 1：基础设施搭建 | 8 | 8-12 |
| 阶段 2：文本资源提取 | 8 | 12-20 |
| 阶段 3：组件迁移 | 6 | 16-24 |
| 阶段 4：语言切换功能 | 6 | 8-12 |
| 阶段 5：测试与优化 | 8 | 12-16 |
| 阶段 6：文档和发布 | 3 | 4-6 |
| **总计** | **39** | **60-90 小时** |

*注：时间估算基于单人全职工作，实际时间可能因团队规模、经验水平和具体需求而有所差异。*

## 验收标准

每个任务完成后应满足以下条件：

### 功能验收
- 任务描述的功能已完整实现
- 相关功能测试通过
- 无明显 bug 或异常行为

### 代码质量验收
- 代码符合项目规范
- TypeScript 类型检查通过
- 代码审查通过

### 文档验收
- 必要的文档已更新
- 注释和说明清晰
- 代码变更可追踪

### 性能验收
- 无明显性能退化
- 符合性能基准要求
- 内存和 CPU 使用合理
