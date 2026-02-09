# Implementation Tasks

## 1. 主进程引导管理器实现

### 1.1 创建 OnboardingManager 核心类
- [ ] 1.1.1 创建 `src/main/onboarding-manager.ts` 文件
  - 定义 OnboardingManager 类
  - 实现单例模式或实例管理
  - 注入依赖管理器（VersionManager、DependencyManager、WebServiceManager、ConfigManager）
  - 实现 electron-store 的访问接口

- [ ] 1.1.2 实现触发条件检测逻辑
  - 实现 `checkTriggerCondition()` 方法
  - 检查 electron-store 中的引导状态（isSkipped、isCompleted）
  - 调用 VersionManager 检查已安装版本数量
  - 返回是否应显示引导的结果

- [ ] 1.1.3 实现状态持久化方法
  - 实现 `getOnboardingState()` 方法
  - 实现 `setOnboardingState()` 方法
  - 定义 OnboardingState 接口（isActive、currentStep、isSkipped、isCompleted）

- [ ] 1.1.4 实现跳过引导功能
  - 实现 `skipOnboarding()` 方法
  - 更新 electron-store 中的 isSkipped 状态
  - 发送跳过完成事件

### 1.2 实现引导流程协调方法
- [ ] 1.2.1 实现下载包协调
  - 实现 `downloadLatestPackage()` 方法
  - 调用 VersionManager 获取最新版本信息
  - 调用 VersionManager 执行下载
  - 通过 IPC 发送下载进度事件
  - 处理下载错误和重试逻辑

- [ ] 1.2.2 实现依赖安装协调
  - 实现 `installDependencies(version)` 方法
  - 调用 DependencyManager 检查依赖状态
  - 调用 DependencyManager 安装缺失依赖
  - 通过 IPC 发送安装进度事件
  - 处理安装失败场景

- [ ] 1.2.3 实现服务启动协调
  - 实现 `startWebService(version)` 方法
  - 调用 WebServiceManager 启动服务
  - 监控服务启动状态
  - 通过 IPC 发送启动进度事件
  - 处理启动失败场景

### 1.3 注册 IPC 处理器
- [ ] 1.3.1 在 `src/main/main.ts` 中注册引导相关 IPC 处理器
  - `ipcMain.handle('onboarding:check-trigger', checkTriggerCondition)`
  - `ipcMain.handle('onboarding:get-state', getOnboardingState)`
  - `ipcMain.handle('onboarding:skip', skipOnboarding)`
  - `ipcMain.handle('onboarding:download-package', downloadLatestPackage)`
  - `ipcMain.handle('onboarding:install-dependencies', installDependencies)`
  - `ipcMain.handle('onboarding:start-service', startWebService)`
  - `ipcMain.handle('onboarding:complete', completeOnboarding)`

- [ ] 1.3.2 设置 IPC 事件发送
  - 下载进度事件：`onboarding:download-progress`
  - 依赖安装进度事件：`onboarding:dependency-progress`
  - 服务启动进度事件：`onboarding:service-progress`

## 2. 渲染进程引导 UI 组件实现

### 2.1 创建引导目录结构
- [ ] 2.1.1 创建 `src/renderer/components/onboarding/` 目录
- [ ] 2.1.2 创建 `src/renderer/components/onboarding/steps/` 子目录

### 2.2 实现主向导组件
- [ ] 2.2.1 创建 `OnboardingWizard.tsx` 主组件
  - 实现向导容器布局
  - 实现步骤导航逻辑
  - 实现进度指示器集成
  - 实现操作按钮组集成
  - 处理步骤切换动画
  - 处理跳过确认对话框

### 2.3 实现步骤组件
- [ ] 2.3.1 创建 `WelcomeIntro.tsx`（步骤1：应用介绍）
  - 显示欢迎标题和应用说明
  - 显示功能特性列表
  - 显示安装流程概述
  - 实现"开始安装"按钮

- [ ] 2.3.2 创建 `PackageDownload.tsx`（步骤2：下载包）
  - 显示下载状态（进行中/已完成）
  - 显示下载进度条和百分比
  - 显示已下载/总大小
  - 显示下载速度和剩余时间
  - 实现"下一步"按钮（下载完成后启用）

- [ ] 2.3.3 创建 `DependencyInstaller.tsx`（步骤3：安装依赖）
  - 显示依赖项列表（已安装/安装中/待安装）
  - 显示每个依赖的安装状态和进度
  - 显示总体安装进度
  - 显示当前安装的依赖项信息
  - 实现"下一步"按钮（安装完成后启用）

- [ ] 2.3.4 创建 `ServiceLauncher.tsx`（步骤4：启动服务）
  - 显示服务启动进度
  - 显示当前启动阶段信息
  - 显示安装信息摘要（版本、数据目录、端口）
  - 启动成功后显示完成界面
  - 显示技术支持信息
  - 实现"进入主界面"按钮

### 2.4 实现辅助组件
- [ ] 2.4.1 创建 `OnboardingProgress.tsx` 进度指示器
  - 显示步骤圆点（4个）
  - 高亮当前步骤
  - 显示步骤间的连接线
  - 支持点击跳转到已完成步骤

- [ ] 2.4.2 创建 `OnboardingActions.tsx` 操作按钮组
  - 实现"上一步"按钮（第一步禁用）
  - 实现"下一步"按钮（根据步骤状态启用/禁用）
  - 实现"取消"按钮
  - 实现"跳过引导"复选框

### 2.5 创建跳过确认对话框
- [ ] 2.5.1 创建 `SkipConfirmDialog.tsx`
  - 使用 shadcn/ui Dialog 组件
  - 显示跳过确认信息
  - 说明跳过后的操作方式
  - 实现"取消"和"跳过引导"按钮

## 3. Redux 状态管理实现

### 3.1 创建 onboardingSlice
- [ ] 3.1.1 创建 `src/renderer/store/slices/onboardingSlice.ts`
  - 定义 OnboardingState 接口
  - 定义 initialState
  - 创建 slice 使用 `createSlice()`
  - 定义 reducers：
    - `startOnboarding`
    - `nextStep`
    - `previousStep`
    - `skipOnboarding`
    - `completeOnboarding`
    - `updateDownloadProgress`
    - `updateDependencyStatus`
    - `updateServiceStatus`
    - `resetOnboarding`

- [ ] 3.1.2 导出 actions 和 selector
  - 导出所有 actions
  - 创建 selector 函数：
    - `selectOnboardingState`
    - `selectCurrentStep`
    - `selectIsActive`
    - `selectDownloadProgress`
    - `selectDependencyStatus`

- [ ] 3.1.3 集成到 Redux store
  - 在 `src/renderer/store/index.ts` 中添加 onboardingReducer

### 3.2 创建 onboardingSaga
- [ ] 3.2.1 创建 `src/renderer/store/sagas/onboardingSaga.ts`
  - 导入必要的依赖（redux-saga/effects）
  - 实现监听器：
    - `watchStartOnboarding`
    - `watchDownloadPackage`
    - `watchInstallDependencies`
    - `watchStartService`
    - `watchSkipOnboarding`
    - `watchCompleteOnboarding`

- [ ] 3.2.2 实现 IPC 调用逻辑
  - 使用 `call` effect 调用 IPC 接口
  - 处理成功响应，dispatch 相应的 action
  - 使用 `put` effect 更新状态
  - 处理错误情况

- [ ] 3.2.3 实现进度监听
  - 使用 `eventChannel` 监听主进程事件
  - 监听下载进度事件
  - 监听依赖安装进度事件
  - 监听服务启动进度事件
  - 在 saga 中处理事件并更新状态

- [ ] 3.2.4 集成到 root saga
  - 在 `src/renderer/store/sagas/index.ts` 中添加 onboardingSaga

## 4. 应用入口集成

### 4.1 修改 App.tsx
- [ ] 4.1.1 添加引导触发检测逻辑
  - 在应用启动时调用 `checkTriggerCondition` IPC
  - 根据返回值决定是否显示引导向导

- [ ] 4.1.2 添加引导向导渲染
  - 在 JSX 中添加 OnboardingWizard 组件
  - 根据 isActive 状态控制显示/隐藏
  - 使用条件渲染或 Portals

- [ ] 4.1.3 处理引导完成后的导航
  - 监听引导完成状态
  - 完成后跳转到主界面
  - 刷新应用状态

## 5. 国际化支持

### 5.1 创建中文翻译
- [ ] 5.1.1 创建 `src/renderer/i18n/locales/zh-CN/onboarding.json`
  - 添加引导标题和描述
  - 添加四个步骤的标题和内容
  - 添加按钮文本
  - 添加进度提示文本
  - 添加错误消息
  - 添加技术支持信息

### 5.2 创建英文翻译
- [ ] 5.2.1 创建 `src/renderer/i18n/locales/en-US/onboarding.json`
  - 添加对应的英文翻译
  - 保持键结构与中文版一致

### 5.3 更新现有翻译文件
- [ ] 5.3.1 更新 `src/renderer/i18n/locales/zh-CN/components.json`
  - 添加引导相关的翻译键（如与组件共享）

- [ ] 5.3.2 更新 `src/renderer/i18n/locales/en-US/components.json`
  - 添加对应的英文翻译键

## 6. Preload 脚本更新

### 6.1 添加 IPC 接口声明
- [ ] 6.1.1 在 `src/preload/index.ts` 中添加引导相关接口
  - 添加 `checkTriggerCondition` 方法声明
  - 添加 `getOnboardingState` 方法声明
  - 添加 `skipOnboarding` 方法声明
  - 添加 `downloadPackage` 方法声明
  - 添加 `installDependencies` 方法声明
  - 添加 `startService` 方法声明
  - 添加 `completeOnboarding` 方法声明

- [ ] 6.1.2 添加事件监听器接口
  - 添加 `onDownloadProgress` 事件监听器
  - 添加 `onDependencyProgress` 事件监听器
  - 添加 `onServiceProgress` 事件监听器

## 7. 类型定义

### 7.1 创建共享类型
- [ ] 7.1.1 创建 `src/types/onboarding.ts`
  - 定义 `OnboardingState` 接口
  - 定义 `DependencyStatus` 类型
  - 定义 `ServiceProgressStatus` 类型
  - 定义 `OnboardingStep` 枚举
  - 定义 `DownloadProgress` 接口

## 8. 测试和验证

### 8.1 单元测试
- [ ] 8.1.1 测试 OnboardingManager 类
  - 测试触发条件检测逻辑
  - 测试状态持久化
  - 测试各协调方法的调用

- [ ] 8.1.2 测试 Redux slice
  - 测试所有 actions 的状态更新
  - 测试 selector 的正确性

- [ ] 8.1.3 测试 Redux saga
  - 测试 IPC 调用逻辑
  - 测试事件监听和状态更新

### 8.2 集成测试
- [ ] 8.2.1 测试完整引导流程
  - 从触发到完成的端到端测试
  - 验证每个步骤的状态更新
  - 验证 IPC 通信正确性

- [ ] 8.2.2 测试跳过功能
  - 验证跳过确认对话框
  - 验证跳过状态持久化
  - 验证跳过后不再触发

- [ ] 8.2.3 测试错误场景
  - 测试下载失败处理
  - 测试依赖安装失败处理
  - 测试服务启动失败处理
  - 测试网络错误场景

### 8.3 UI 测试
- [ ] 8.3.1 测试步骤导航
  - 测试上一步/下一步按钮
  - 测试进度指示器更新
  - 测试步骤切换动画

- [ ] 8.3.2 测试进度显示
  - 测试下载进度条更新
  - 测试依赖安装状态显示
  - 测试服务启动进度显示

- [ ] 8.3.3 测试响应式布局
  - 测试不同窗口尺寸下的显示
  - 测试高 DPI 屏幕显示

## 9. 文档更新

- [ ] 9.1 更新用户文档（如需要）
  - 添加首次使用引导说明
  - 添加跳过引导后的手动操作说明

## 10. 代码审查和优化

- [ ] 10.1 TypeScript 类型检查
  - 确保所有新代码类型正确
  - 为新组件添加 Props 类型定义
  - 为新方法添加参数和返回值类型

- [ ] 10.2 代码格式化
  - 运行 linter 检查
  - 修复格式问题

- [ ] 10.3 构建验证
  - 确保构建成功
  - 验证生产构建正常

- [ ] 10.4 性能优化
  - 优化组件渲染性能
  - 减少不必要的重渲染
  - 优化事件监听器清理
