# Implementation Tasks: 集成内嵌Web服务的管理与打包功能

本文档列出了实现提案中所有功能所需的任务清单。请按顺序完成这些任务，并在完成后将每个任务标记为 `[x]`。

## Phase 1: 进程管理模块实现

### 1.1 创建 Web 服务管理器类
- [ ] 创建 `src/main/web-service-manager.ts` 文件
- [ ] 实现 `PCodeWebServiceManager` 类基础结构
- [ ] 定义 `WebServiceConfig` 接口（port, host, executablePath 等）
- [ ] 定义 `ProcessStatus` 类型（running, stopped, error, starting）
- [ ] 实现 `getExecutablePath()` 方法，根据平台返回正确的可执行文件路径
- [ ] 实现 `getPlatformSpecificArgs()` 方法，返回平台特定的启动参数
- [ ] 添加进程事件监听器（exit, error, close）

**验证标准**：
- 代码通过 TypeScript 类型检查
- 单元测试覆盖核心方法

### 1.2 实现进程启动功能
- [ ] 实现 `start()` 方法，使用 `child_process.spawn()` 启动 .NET Web 服务
- [ ] 添加启动前的端口检测逻辑
- [ ] 实现 stdout 和 stderr 日志重定向到 `electron-log`
- [ ] 添加启动超时机制（30 秒超时）
- [ ] 实现启动成功检测（HTTP 健康检查）
- [ ] 处理启动失败场景，返回详细的错误信息

**验证标准**：
- 能够成功启动 .NET Web 服务进程
- 启动失败时返回清晰的错误信息
- 日志正确记录到文件

### 1.3 实现进程停止功能
- [ ] 实现 `stop()` 方法，优雅地终止进程
- [ ] 实现 Windows 平台的进程树终止逻辑（使用 `taskkill /F /T /PID`）
- [ ] 实现 Unix 平台的进程组终止逻辑（使用 `kill -PGID`）
- [ ] 添加停止超时机制（10 秒超时后强制杀死）
- [ ] 清理进程相关的所有资源
- [ ] 处理停止失败场景

**验证标准**：
- 进程能够正常终止，无僵尸进程
- 强制终止逻辑在超时后正确执行
- 资源完全释放

### 1.4 实现状态监控功能
- [ ] 实现 `getStatus()` 方法，返回当前进程状态
- [ ] 添加进程运行状态跟踪
- [ ] 实现 HTTP 健康检查（ping `/api/health` 或 `/api/status`）
- [ ] 添加进程崩溃检测和自动恢复机制
- [ ] 实现进程重启计数器（防止无限重启循环）

**验证标准**：
- 状态信息准确反映进程实际情况
- 进程崩溃后能够检测并记录
- 自动恢复机制正常工作

## Phase 2: IPC 通信层

### 2.1 扩展 IPC Handlers
- [ ] 在 `src/main/main.ts` 中添加 `get-web-service-status` handler
- [ ] 添加 `start-web-service` handler
- [ ] 添加 `stop-web-service` handler
- [ ] 添加 `restart-web-service` handler
- [ ] 添加 `get-web-service-version` handler
- [ ] 添加 `get-web-service-url` handler
- [ ] 实现进程状态变化时向渲染进程推送更新

**验证标准**：
- 所有 IPC handlers 正确响应
- 错误处理完整，不会导致主进程崩溃
- 状态推送实时且准确

### 2.2 扩展 Preload API
- [ ] 在 `src/preload/index.ts` 中暴露 Web 服务相关的 API
- [ ] 添加类型安全的 TypeScript 接口定义
- [ ] 实现 `onWebServiceStatusChange` 事件监听器
- [ ] 添加错误处理和超时机制

**验证标准**：
- Preload API 类型安全
- 渲染进程可以正确调用所有 API
- 事件监听器正常工作

## Phase 2.5: Redux 状态管理实现

### 2.5.1 创建 Redux Slice
- [ ] 创建 `src/renderer/store/slices/webServiceSlice.ts` 文件
- [ ] 定义 `WebServiceState` 接口（包含 status, pid, url, version, lastError, isOperating, restartCount, startTime）
- [ ] 使用 `createSlice` 创建 webService slice
- [ ] 实现同步 reducers：
  - `setStatus`：更新服务状态
  - `setOperating`：更新操作进行中标志
  - `setError`：设置错误信息
  - `clearError`：清除错误信息
  - `setPid`：更新进程 ID
  - `setUrl`：更新服务 URL
  - `setVersion`：更新版本信息
  - `incrementRestartCount`：增加重启计数
- [ ] 导出 actions 和 selectors
- [ ] 添加 slice 到 root reducer

**验证标准**：
- TypeScript 类型检查通过
- Reducers 是纯函数，无副作用
- Selectors 正确返回状态片段

### 2.5.2 实现 Redux Saga Effects
- [ ] 创建 `src/renderer/store/sagas/webServiceSaga.ts` 文件
- [ ] 实现 `startWebService` saga：
  - dispatch `setOperating(true)` action
  - 调用 IPC `start-web-service`
  - 根据结果 dispatch `setStatus` 或 `setError`
  - 最后 dispatch `setOperating(false)`
- [ ] 实现 `stopWebService` saga：
  - dispatch `setOperating(true)` action
  - 调用 IPC `stop-web-service`
  - 根据结果 dispatch `setStatus` 或 `setError`
  - 最后 dispatch `setOperating(false)`
- [ ] 实现 `restartWebService` saga：
  - 先调用 `stopWebService`
  - 等待停止完成
  - 再调用 `startWebService`
- [ ] 实现 `watchWebServiceStatusChanges` saga：
  - 监听 preload API 的 `onWebServiceStatusChange` 事件
  - dispatch 相应的 `setStatus` action
- [ ] 实现 `pollWebServiceStatus` saga（可选）：
  - 定期调用 `get-web-service-status` 作为状态推送的备份机制
- [ ] 实现 root saga 并注册到 saga middleware

**验证标准**：
- Sagas 正确处理 IPC 调用的异步操作
- 错误被正确捕获并转换为状态更新
- 状态变化在 1 秒内反映到 UI
- 支持 saga 单元测试

### 2.5.3 集成 Redux 到渲染进程
- [ ] 确保 `@reduxjs/toolkit` 和 `react-redux` 已安装
- [ ] 确保 `redux-saga` 已安装
- [ ] 在 `src/renderer/store/configureStore.ts` 中注册 webServiceReducer
- [ ] 在 `src/renderer/store/index.ts` 中导出配置好的 store
- [ ] 在 `src/renderer/main.tsx` 中用 `Provider` 包裹应用
- [ ] 添加 Redux DevTools 配置

**验证标准**：
- Store 正确配置，包含 webService state
- Redux DevTools 可以查看状态变化
- 应用启动时无 Redux 相关错误

## Phase 3: UI 界面实现

### 3.1 创建 Web 服务状态卡片组件
- [ ] 创建 `src/renderer/components/WebServiceStatusCard.tsx` 组件
- [ ] 使用 `useSelector` hook 连接 Redux store
- [ ] 从 store 中选择：status, url, version, isOperating, lastError, pid
- [ ] 添加服务状态指示器（运行中/已停止/异常/启动中/停止中）
- [ ] 添加服务访问地址显示（URL 和端口）
- [ ] 添加版本信息显示
- [ ] 添加进程 ID 显示（调试用）
- [ ] 添加错误提示显示（当 lastError 存在时）

**验证标准**：
- UI 正确显示所有状态信息
- 状态更新实时反映到 UI
- 组件响应式设计，适配不同屏幕尺寸

### 3.2 实现控制按钮和交互逻辑
- [ ] 添加启动按钮（当 status 为 'stopped' 或 'error' 时启用）
- [ ] 添加停止按钮（当 status 为 'running' 时启用）
- [ ] 添加重启按钮（当 status 为 'running' 时启用）
- [ ] 使用 `useDispatch` hook 获取 dispatch 函数
- [ ] 实现按钮点击处理：
  - 启动按钮：dispatch `startWebService` action
  - 停止按钮：dispatch `stopWebService` action
  - 重启按钮：dispatch `restartWebService` action
- [ ] 根据 `isOperating` 状态禁用所有按钮
- [ ] 添加加载状态指示器（当 `isOperating` 为 true 时）
- [ ] 添加操作确认对话框（停止和重启时）
- [ ] 使用 toast/sonner 显示操作成功/失败通知
- [ ] 添加 "在浏览器中打开" 按钮（当服务运行时）

**验证标准**：
- 所有按钮功能正常
- 按钮状态根据 Redux 状态正确启用/禁用
- 操作过程中 UI 保持响应
- 通知清晰且有帮助

### 3.3 集成到主窗口
- [ ] 在 `src/renderer/App.tsx` 中导入 `WebServiceStatusCard` 组件
- [ ] 在适当位置渲染 `WebServiceStatusCard`（如服务器管理区域）
- [ ] 确保 Redux Provider 已在应用根部配置
- [ ] 添加组件边界和错误处理

**验证标准**：
- 组件正确集成到主窗口
- 布局协调，不影响其他元素
- 状态管理与应用其他部分不冲突

### 3.4 UI 样式优化
- [ ] 设计符合现有风格的组件样式
- [ ] 添加状态变化的动画效果
- [ ] 优化响应式布局
- [ ] 添加暗色模式支持（如果需要）
- [ ] 确保跨平台 UI 一致性

**验证标准**：
- UI 美观且符合现有设计语言
- 所有平台上显示一致
- 动画流畅不影响性能

## Phase 4: 版本管理系统

### 4.1 实现版本读取功能
- [ ] 在 `src/main/web-service-manager.ts` 中添加 `getVersion()` 方法
- [ ] 实现从 `appsettings.yml` 读取版本信息
- [ ] 实现从 `version.txt` 读取版本信息（备用方案）
- [ ] 添加版本解析逻辑（支持多种版本格式）
- [ ] 处理版本文件不存在的情况

**验证标准**：
- 能够正确读取版本信息
- 版本文件不存在时返回默认值
- 支持常见版本格式（如 "1.0.0", "v1.0.0" 等）

### 4.2 UI 版本显示集成
- [ ] 在 `WebServiceStatusCard` 中添加版本信息显示
- [ ] 添加版本更新检测的占位符（为未来功能准备）
- [ ] 显示 Web 服务和桌面应用的版本对比

**验证标准**：
- 版本信息正确显示
- UI 布局合理，不影响其他元素

## Phase 5: 软件包管理系统

### 5.1 创建软件包管理器类
- [ ] 创建 `src/main/package-manager.ts` 文件
- [ ] 定义 `PackageInfo` 接口（version, platform, installedPath, isInstalled）
- [ ] 实现 `PCodePackageManager` 类基础结构
- [ ] 实现 `checkInstalled()` 方法，检查软件包是否已安装
- [ ] 实现 `getPlatformPackageName()` 方法，根据平台返回包名
- [ ] 实现 `getPackageSourcePath()` 方法，返回本地开发包路径
- [ ] 添加包元数据管理（meta.json 读写）

**验证标准**：
- 能够正确检测当前平台
- 能够判断软件包是否已安装
- meta.json 正确读写

### 5.2 实现包下载功能
- [ ] 实现 `downloadPackage()` 方法
- [ ] 本地开发环境：从 `/home/newbe36524/repos/newbe36524/pcode/Release/release-packages/` 复制文件
- [ ] 生产环境预留：从 URL 下载（未来功能）
- [ ] 实现下载进度回调
- [ ] 添加下载到 cache 目录的逻辑
- [ ] 实现文件完整性验证（SHA256，可选）

**验证标准**：
- 本地开发环境能够正确复制 zip 包
- 下载进度正确回调
- 缓存目录结构正确

### 5.3 实现包解压功能
- [ ] 安装 `adm-zip` 或 `extract-zip` 依赖
- [ ] 实现 `extractPackage()` 方法
- [ ] 解压 zip 包到 `userData/pcode-web/installed/<platform>/`
- [ ] 设置正确的文件权限（可执行文件 +x 权限）
- [ ] 处理解压失败场景
- [ ] 实现解压回滚机制

**验证标准**：
- zip 包正确解压到目标目录
- 可执行文件有正确的执行权限
- 解压失败能够回滚

### 5.4 实现完整安装流程
- [ ] 实现 `installPackage(version)` 方法
- [ ] 整合下载、解压、验证步骤
- [ ] 更新 meta.json 记录安装信息
- [ ] 实现安装进度通知（通过 IPC 推送到渲染进程）
- [ ] 处理磁盘空间不足场景
- [ ] 实现安装失败恢复

**验证标准**：
- 完整安装流程能够成功执行
- meta.json 正确更新
- 磁盘空间检查正常工作
- 安装失败能够恢复

### 5.5 扩展 IPC Handlers
- [ ] 在 `src/main/main.ts` 中添加 `check-package-installation` handler
- [ ] 添加 `install-web-service-package` handler
- [ ] 添加 `get-package-version` handler
- [ ] 添加 `get-available-versions` handler
- [ ] 实现包安装进度推送
- [ ] 添加错误处理和超时机制

**验证标准**：
- 所有 IPC handlers 正确响应
- 安装进度实时推送
- 错误处理完整

### 5.6 扩展 Preload API
- [ ] 在 `src/preload/index.ts` 中暴露包管理相关 API
- [ ] 添加类型安全的 TypeScript 接口定义
- [ ] 实现 `onPackageInstallProgress` 事件监听器
- [ ] 添加错误处理

**验证标准**：
- Preload API 类型安全
- 渲染进程可以正确调用所有 API
- 进度事件正常工作

### 5.7 Redux 集成（包管理状态）
- [ ] 在 webServiceSlice 中添加包管理状态（packageInfo, installProgress）
- [ ] 实现 `setPackageInfo` reducer
- [ ] 实现 `setInstallProgress` reducer
- [ ] 实现 `installWebServicePackage` saga
- [ ] 实现 `checkPackageInstallation` saga
- [ ] 添加安装进度选择器

**验证标准**：
- 包管理状态正确存储在 Redux store
- Saga 正确处理安装流程
- 进度更新实时反映到 UI

## Phase 6: 测试和优化

### 6.1 单元测试
- [ ] 为 `PCodeWebServiceManager` 编写单元测试
- [ ] 为 `PCodePackageManager` 编写单元测试
- [ ] 测试启动、停止、状态查询功能
- [ ] 测试包检测、下载、解压功能
- [ ] 测试错误处理场景
- [ ] 测试边界条件（端口占用、权限不足、磁盘空间不足等）
- [ ] 达到 80% 以上代码覆盖率

**验证标准**：
- 所有核心功能有单元测试
- 测试通过率 100%
- 代码覆盖率符合要求

### 6.2 集成测试
- [ ] 测试完整的软件包安装流程
- [ ] 测试完整的启动流程
- [ ] 测试完整的停止流程
- [ ] 测试状态监控和更新
- [ ] 测试 IPC 通信
- [ ] 测试 UI 交互

**验证标准**：
- 端到端功能测试通过
- 用户场景测试通过
- 无严重 bug

### 6.3 跨平台测试
- [ ] 在 Windows 上测试所有功能
- [ ] 在 macOS 上测试所有功能
- [ ] 在 Linux 上测试所有功能
- [ ] 测试各平台的打包产物
- [ ] 修复平台特定问题

**验证标准**：
- 所有平台功能一致
- 打包产物可用
- 无平台特定 bug

### 6.4 性能优化
- [ ] 优化进程启动时间（目标 < 5 秒）
- [ ] 优化状态轮询性能
- [ ] 减少 UI 更新延迟
- [ ] 优化内存使用
- [ ] 性能测试和基准测试

**验证标准**：
- 启动时间达到目标
- UI 响应流畅
- 内存使用合理（< 200MB）

### 6.5 错误处理和日志
- [ ] 完善所有错误处理逻辑
- [ ] 添加详细的日志记录
- [ ] 实现错误报告机制
- [ ] 添加用户友好的错误提示
- [ ] 编写错误处理文档

**验证标准**：
- 所有错误场景有适当的处理
- 日志完整且易于调试
- 用户能够理解错误信息

### 6.6 文档和发布准备
- [ ] 更新 README.md，添加 Web 服务管理说明
- [ ] 编写用户使用指南
- [ ] 编写开发者文档
- [ ] 准备发布说明
- [ ] 创建截图和演示视频（可选）

**验证标准**：
- 文档完整且清晰
- 用户能够根据文档独立使用功能
- 开发者能够理解实现细节

## 依赖关系说明

### 可以并行执行的任务
- **Phase 1** 和 **Phase 5.1** 可以部分并行（包管理器的基础结构可以提前设计）
- **Phase 2.5** 可以与 **Phase 1** 部分并行（Redux slice 和 sagas 可以先使用 mock IPC）
- **Phase 4** 可以与 **Phase 1.1** 并行开始
- **Phase 3** 的 UI 样式可以在 Redux 实现完成前开始（使用 mock 数据）

### 必须顺序执行的任务
- **Phase 2** 必须在 **Phase 1** 完成后开始
- **Phase 2.5** 必须在 **Phase 2** 完成后开始（需要先有 IPC handlers）
- **Phase 3** 必须在 **Phase 2.5** 完成后开始（需要先有 Redux store）
- **Phase 5.5-5.7** 必须在 **Phase 5.1-5.4** 完成后开始（包管理器核心功能先完成）
- **Phase 6** 必须在所有开发阶段完成后开始

### 关键路径
1. **Phase 1.1 → 1.2 → 1.3 → 1.4**（进程管理核心）
2. **Phase 2**（IPC 通信层）
3. **Phase 5.1 → 5.2 → 5.3 → 5.4**（包管理器核心）
4. **Phase 5.5 → 5.6 → 5.7**（包管理 IPC 和 Redux 集成）
5. **Phase 2.5.1 → 2.5.2 → 2.5.3**（Redux 状态管理）
6. **Phase 3.1 → 3.2 → 3.3**（UI 实现）
7. **Phase 6**（测试）

## 验收标准总结

在所有任务完成后，以下验收标准必须满足：

### 功能性验收
- [x] 用户可以在首页启动和停止 Web 服务
- [x] 服务状态实时更新并正确显示
- [x] **软件包自动检测并安装到正确平台**
- [x] **安装进度正确显示**
- [ ] 各平台（Windows、macOS、Linux）均能正常启动和管理 Web 服务（需要跨平台测试）
- [x] 版本信息正确读取和显示（包括已安装版本）

### 非功能性验收
- [ ] Web 服务启动时间 < 5 秒
- [ ] **软件包安装时间 < 2 分钟（本地开发环境）**
- [ ] UI 响应时间 < 500ms
- [ ] 进程异常恢复成功率 > 95%
- [ ] 单元测试覆盖率 > 80%
- [ ] 所有平台测试通过
- [ ] **磁盘空间检查正常工作**

### 文档验收
- [x] README 更新完成
- [x] 用户使用指南完成
- [x] 开发者文档完成
- [x] 代码注释充分

## 完成检查清单

在准备将此变更标记为完成前，请确认：

- [ ] 所有任务已标记为 `[x]`
- [ ] 所有验收标准已满足
- [ ] 跨平台测试已通过
- [ ] 文档已更新
- [ ] 代码已审查
- [ ] 无未解决的严重 bug
- [ ] 性能测试通过
- [ ] 日志和错误处理完整
