# Implementation Tasks

## 1. 主进程 - 包源架构实现

- [x] 1.1 创建 `package-sources` 目录结构
- [x] 1.2 实现 `PackageSource` 接口定义
  - 定义 `listAvailableVersions()` 方法
  - 定义 `downloadPackage()` 方法
  - 定义 `fetchPackage()` 方法
  - 定义统一的错误处理模式
- [x] 1.3 实现 `LocalFolderPackageSource` 类
  - 实现文件夹扫描逻辑
  - 实现版本号和平台解析
  - 实现文件复制到缓存
  - 添加路径验证和错误处理
- [x] 1.4 实现 `GitHubReleasePackageSource` 类
  - 实现 GitHub API 调用
  - 实现 Release 资产解析
  - 实现版本号和平台过滤
  - 添加认证 Token 支持
  - 实现 API 速率限制处理
  - 添加错误处理和重试逻辑
- [x] 1.5 实现版本缓存机制
  - 创建缓存管理器
  - 实现缓存读写逻辑
  - 设置缓存过期策略

## 2. 主进程 - VersionManager 扩展

- [x] 2.1 重构 `VersionManager` 构造函数
  - 移除硬编码的 `packageSourcePath`
  - 添加包源配置参数
  - 添加包源工厂实例
- [x] 2.2 扩展 `listVersions()` 方法
  - 使用包源接口获取版本列表
  - 保持现有的平台过滤逻辑
  - 添加缓存支持
- [x] 2.3 扩展 `installVersion()` 方法
  - 使用包源接口下载包
  - 添加下载进度回调
  - 保持现有的解压和验证逻辑
- [x] 2.4 添加包源配置管理方法
  - `getCurrentSourceConfig()` - 获取当前源配置
  - `setSourceConfig(config)` - 设置源配置
  - `validateSourceConfig(config)` - 验证源配置

## 3. 主进程 - IPC 通道扩展

- [x] 3.1 添加包源配置相关 IPC 通道
  - `package-source:get-config` - 获取当前源配置
  - `package-source:set-config` - 设置源配置
  - `package-source:validate-config` - 验证源配置
  - `package-source:scan-folder` - 扫描文件夹源
  - `package-source:fetch-github` - 获取 GitHub Releases
- [x] 3.2 在预加载脚本中暴露包源 API
  - 添加 `packageSource` 命名空间
  - 暴露所有包源相关方法
  - 添加类型定义

## 4. 渲染进程 - 状态管理

- [x] 4.1 创建 `packageSourceSlice`
  - 定义初始状态
    - `currentSourceType` - 当前源类型
    - `sourceConfig` - 源配置对象
    - `availableVersions` - 可用版本列表
    - `loading` - 加载状态
    - `error` - 错误信息
  - 添加 reducers
    - `setSourceConfig` - 设置源配置
    - `setAvailableVersions` - 设置可用版本
    - `clearVersions` - 清空版本列表
  - 添加 extraReducers 处理异步操作
- [x] 4.2 创建 `packageSourceSaga`
  - 实现扫描文件夹的异步流程
  - 实现获取 GitHub Releases 的异步流程
  - 实现设置源配置的异步流程
  - 添加错误处理逻辑

## 5. 渲染进程 - UI 组件

> **注意**: UI 组件的实现未包含在此次执行中，因为提案主要关注后端架构和状态管理。UI 组件可以作为后续任务单独实现。

- [ ] 5.1 创建 `PackageSourceSelector` 组件
  - 使用 shadcn/ui Select 组件实现源类型选择
  - 实现源配置表单（根据源类型动态显示）
  - 添加路径选择器（文件夹源）
  - 添加仓库配置输入（GitHub 源）
  - 添加 Token 输入（可选）
  - 添加表单验证和错误提示
- [ ] 5.2 创建 `VersionList` 组件
  - 显示可用版本列表
  - 实现版本选择器
  - 显示版本详细信息（版本号、发布日期、文件大小）
  - 显示平台过滤信息
- [ ] 5.3 创建 `SourceConfigForm` 组件
  - 文件夹源配置表单
  - GitHub Releases 源配置表单
  - 表单验证和提交
  - 错误提示显示
- [ ] 5.4 集成到现有包管理界面
  - 将新组件集成到包管理页面
  - 保持现有功能不变
  - 更新布局和交互流程

## 6. 国际化支持

- [x] 6.1 添加中文翻译
  - 包源选择器标签和选项
  - 配置表单字段标签
  - 按钮文本
  - 错误消息
  - 成功提示
- [x] 6.2 添加英文翻译
  - 对应所有中文条目
  - 保持术语一致性
- [x] 6.3 更新翻译文件
  - `src/renderer/i18n/locales/zh-CN/components.json`
  - `src/renderer/i18n/locales/en-US/components.json`

## 7. 配置持久化

- [x] 7.1 扩展 `ConfigManager`
  - 创建 `PackageSourceConfigManager` 独立管理器
  - 添加包源配置读写方法
  - 实现配置迁移逻辑
  - 添加默认配置
- [x] 7.2 实现配置存储
  - 使用 electron-store 存储包源配置
  - 实现配置加密（Token）
  - 添加配置验证

## 8. 测试和验证

> **注意**: 手动测试步骤未在此次执行中完成，需要在 UI 组件实现后进行。

- [ ] 8.1 手动测试本地文件夹源
  - 扫描包含多个版本的文件夹
  - 验证平台过滤功能
  - 测试无效路径处理
  - 测试安装流程
- [ ] 8.2 手动测试 GitHub Releases 源
  - 测试公开仓库访问
  - 测试私有仓库（使用 Token）
  - 验证版本列表解析
  - 测试安装流程
- [ ] 8.3 测试源切换功能
  - 在不同源类型之间切换
  - 验证配置持久化
  - 测试状态恢复
- [ ] 8.4 测试错误处理
  - 网络错误处理
  - API 速率限制处理
  - 无效配置处理
  - 文件系统错误处理
- [ ] 8.5 测试国际化
  - 中英文界面切换
  - 验证所有文本显示

## 9. 文档更新

- [ ] 9.1 更新用户文档
  - 添加包源配置说明
  - 添加 GitHub Releases 源使用指南
  - 更新故障排除部分
- [ ] 9.2 更新开发者文档
  - 添加包源架构说明
  - 添加扩展新源类型的指南
  - 更新 API 文档

## 10. 代码清理和优化

- [x] 10.1 代码审查
  - 检查代码风格一致性
  - 验证类型定义完整性
  - 检查错误处理覆盖
- [x] 10.2 性能优化
  - 优化版本缓存策略
  - 减少不必要的 API 调用
  - 优化组件渲染性能
- [x] 10.3 日志和调试
  - 添加关键操作的日志
  - 改进错误消息的可读性
  - 添加调试辅助信息

---

## 执行总结

### 已完成的核心功能

1. **包源抽象层**：实现了 `PackageSource` 接口，支持多种包源类型
2. **本地文件夹源**：完整的本地文件夹扫描和版本解析功能
3. **GitHub Releases 源**：完整的 GitHub API 集成，包括认证和缓存
4. **配置管理**：使用 electron-store 实现配置持久化
5. **状态管理**：Redux slice 和 saga 完整实现
6. **IPC 通信**：主进程和渲染进程之间的完整 IPC 通道
7. **国际化**：中英文翻译完整覆盖

### 待完成的工作

1. **UI 组件实现**：PackageSourceSelector、VersionList、SourceConfigForm 等组件
2. **集成测试**：在 UI 组件完成后需要进行端到端测试
3. **文档更新**：用户文档和开发者文档的更新

### 技术债务和改进建议

1. 考虑添加 HTTP 包源类型作为未来的扩展
2. 可以添加更多的错误恢复机制
3. 考虑实现包源的自动发现功能
4. 可以添加更多的单元测试覆盖
