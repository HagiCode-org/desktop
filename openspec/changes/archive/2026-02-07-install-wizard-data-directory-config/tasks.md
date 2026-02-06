# Implementation Tasks

## 1. 主进程功能实现

### 1.1 包管理器扩展
- [x] 1.1.1 在 `package-manager.ts` 中添加 `writeDataDirConfig()` 方法
  - 使用 `js-yaml` 库读取 `appsettings.yml`
  - 更新或添加 `DataDir` 配置项（值为绝对路径）
  - 写回文件并保存

- [x] 1.1.2 在 `package-manager.ts` 中添加 `ensureDataDirExists()` 方法
  - 使用 `app.getPath('userData')` 获取用户数据目录
  - 构建数据目录路径：`<userData>/apps/data`
  - 检查目录是否存在，如不存在则递归创建
  - 设置适当的目录权限
  - 返回数据目录的绝对路径

- [x] 1.1.3 在 `package-manager.ts` 中修改 `installPackage()` 方法
  - 在安装验证成功后，调用 `ensureDataDirExists()` 创建数据目录
  - 调用 `writeDataDirConfig()` 更新配置文件（传入绝对路径）
  - 通过 `onProgress` 回调报告配置进度
  - 处理可能的错误（权限不足、磁盘空间不足等）

### 1.2 配置管理辅助类
- [x] 1.2.1 创建 `src/main/config-manager.ts`（如尚不存在）
  - 实现 `readConfig(configPath: string)` 方法
  - 实现 `writeConfig(configPath: string, config: object)` 方法
  - 实现 `updateDataDir(installPath: string, dataDir: string)` 方法
  - 处理 YAML 格式正确性和文件读写错误
  - `dataDir` 参数为绝对路径

## 2. 渲染进程 UI 更新

### 2.1 安装进度显示
- [x] 2.1.1 更新 `src/renderer/components/PackageManagementCard.tsx`
  - 在安装进度中添加"配置数据目录"状态显示
  - 显示数据目录位置信息
  - 处理数据目录配置相关的错误消息

### 2.2 无需新增组件
- [x] 2.2.1 确认不需要创建安装向导对话框
  - 数据目录自动配置，无需用户交互
  - 保持现有安装流程不变

## 3. 国际化支持

### 3.1 中文翻译
- [x] 3.1.1 更新 `src/renderer/i18n/locales/zh-CN/components.json`
  - 添加 `packageManagement.dataDirectory.configuring` 翻译
  - 添加 `packageManagement.dataDirectory.configured` 翻译
  - 添加 `packageManagement.dataDirectory.error.*` 翻译

### 3.2 英文翻译
- [x] 3.2.1 更新 `src/renderer/i18n/locales/en-US/components.json`
  - 添加 `packageManagement.dataDirectory.configuring` 翻译
  - 添加 `packageManagement.dataDirectory.configured` 翻译
  - 添加 `packageManagement.dataDirectory.error.*` 翻译

## 4. 测试和验证

### 4.1 单元测试
- [ ] 4.1.1 测试 `writeDataDirConfig()` 方法
  - 测试新配置写入
  - 测试已有配置更新
  - 测试 YAML 格式正确性
  - 测试绝对路径的正确写入

- [ ] 4.1.2 测试 `ensureDataDirExists()` 方法
  - 测试使用 `app.getPath('userData')` 获取路径
  - 测试目录不存在时自动创建 `<userData>/apps/data`
  - 测试目录已存在时不报错
  - 测试递归创建多级目录
  - 测试权限不足场景

- [ ] 4.1.3 测试 `installPackage()` 集成
  - 测试安装完成后自动配置数据目录
  - 测试配置失败时的错误处理
  - 测试进度回调正确报告

### 4.2 集成测试
- [ ] 4.2.1 测试完整安装流程
  - 验证安装后 `appsettings.yml` 包含正确的 `DataDir` 配置
  - 验证数据目录被正确创建在 `<userData>/apps/data`
  - 验证数据目录路径为绝对路径

- [ ] 4.2.2 测试跨平台兼容性
  - Windows `userData` 路径格式验证
  - macOS `userData` 路径格式验证
  - Linux `userData` 路径格式验证

### 4.3 错误场景测试
- [ ] 4.3.1 测试权限不足场景
  - 模拟无写入权限的目录
  - 验证错误消息正确显示

- [ ] 4.3.2 测试磁盘空间不足场景
  - 模拟磁盘空间不足
  - 验证错误消息正确显示

## 5. 文档更新

- [ ] 5.1 更新用户文档（如需要）
  - 说明数据目录的默认位置为 `<userData>/apps/data`
  - 说明数据目录的用途
  - 说明不同操作系统的 `userData` 路径位置

## 6. 向后兼容性处理

- [ ] 6.1 实现现有安装的兼容处理
  - 在包管理器启动时检查已安装包的配置
  - 如果 `appsettings.yml` 中没有 `DataDir`，自动添加默认路径
  - 确保现有用户升级后不受影响

## 7. 代码审查和优化

- [x] 7.1 TypeScript 类型检查
  - 确保所有新代码类型正确
  - 为新方法添加类型定义

- [ ] 7.2 代码格式化
  - 运行 linter 检查

- [x] 7.3 构建验证
  - 确保构建成功

## 8. 移除的任务（不再需要）

以下任务已根据简化需求移除：
- ~~创建安装向导对话框组件~~
- ~~创建数据目录配置步骤组件~~
- ~~路径选择和验证 UI~~
- ~~Redux 状态管理（安装向导相关）~~
- ~~IPC 接口（目录选择、路径验证）~~

## 实施总结

**已完成的核心功能：**
1. 创建了 `ConfigManager` 类处理 YAML 配置读写
2. 在 `package-manager.ts` 中添加了 `ensureDataDirExists()` 和 `writeDataDirConfig()` 方法
3. 在 `installPackage()` 和 `installFromSource()` 方法中集成了数据目录自动配置
4. 更新了中英文国际化翻译
5. 通过 TypeScript 类型检查和构建验证

**未完成的测试任务：**
- 单元测试
- 集成测试
- 错误场景测试
- 向后兼容性处理
- 用户文档更新

注意：测试任务（第 4 节）和文档更新（第 5 节）可以后续补充。核心功能已全部实现并通过构建验证。
