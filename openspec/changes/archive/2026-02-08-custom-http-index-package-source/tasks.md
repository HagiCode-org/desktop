# Implementation Tasks

## 1. 后端实现 (主进程)

- [x] 1.1 扩展类型定义以支持HTTP索引源
  - [x] 在 `package-source.ts` 中添加 `HttpIndexConfig` 接口
  - [x] 在 `PackageSourceType` 类型中添加 `'http-index'` 选项
  - [x] 在 `StoredPackageSourceConfig` 类型中添加 `'http-index'` 支持

- [x] 1.2 创建HTTP索引源实现类
  - [x] 创建 `src/main/package-sources/http-index-source.ts`
  - [x] 实现 `HttpIndexPackageSource` 类
  - [x] 实现 `listAvailableVersions()` 方法
  - [x] 实现 `downloadPackage()` 方法
  - [x] 实现 `validateConfig()` 方法
  - [x] 添加版本列表缓存机制

- [x] 1.3 更新包源工厂
  - [x] 在 `src/main/package-sources/index.ts` 中注册新包源类型
  - [x] 导出 `HttpIndexPackageSource` 类
  - [x] 导出相关类型定义

- [x] 1.4 更新配置管理器
  - [x] 确保 `PackageSourceConfigManager` 支持新类型的存储
  - [x] 验证配置序列化/反序列化

## 2. IPC通信层

- [x] 2.1 注册HTTP索引相关IPC处理器
  - [x] 在 `src/main/main.ts` 中添加验证配置处理器
  - [x] 添加获取版本列表处理器
  - [x] 确保错误处理和日志记录

- [x] 2.2 扩展preload API类型
  - [x] 在 `src/preload/index.ts` 中添加HTTP索引相关API类型定义
  - [x] 更新 `PackageSourceAPI` 接口

## 3. 前端状态管理

- [x] 3.1 扩展Redux slice
  - [x] 在 `packageSourceSlice.ts` 中添加HTTP索引表单状态
  - [x] 添加 `httpIndexUrl` state
  - [x] 添加 `httpBaseUrl` state
  - [x] 添加 `httpAuthToken` state
  - [x] 添加相应的action creators和selectors

- [x] 3.2 扩展Redux saga
  - [x] 添加 `FETCH_HTTP_INDEX` action type
  - [x] 实现 `fetchHttpIndex` worker saga
  - [x] 实现 `watchFetchHttpIndex` watcher saga
  - [x] 在root saga中注册新的watcher

## 4. UI组件

- [x] 4.1 扩展包源选择器组件
  - [x] 在源类型下拉菜单中添加"HTTP 索引源"选项
  - [x] 创建HTTP索引配置表单UI
  - [x] 添加索引URL输入框
  - [x] 添加下载URL前缀输入框(可选)
  - [x] 添加认证令牌输入框(可选)
  - [x] 实现表单验证逻辑
  - [x] 添加帮助提示文本

- [x] 4.2 添加错误处理UI
  - [x] 显示索引获取失败的错误信息
  - [x] 提供重试按钮
  - [x] 添加加载状态指示器

## 5. 国际化

- [x] 5.1 中文翻译
  - [x] 在 `src/renderer/i18n/locales/zh-CN/components.json` 中添加翻译键
  - [x] 添加源类型名称
  - [x] 添加表单标签和占位符
  - [x] 添加帮助文本
  - [x] 添加错误消息

- [x] 5.2 英文翻译
  - [x] 在 `src/renderer/i18n/locales/en-US/components.json` 中添加对应翻译

## 6. 测试与验证

- [ ] 6.1 单元测试
  - [ ] 测试 `HttpIndexPackageSource.listAvailableVersions()`
  - [ ] 测试 `HttpIndexPackageSource.downloadPackage()`
  - [ ] 测试 `HttpIndexPackageSource.validateConfig()`
  - [ ] 测试版本解析逻辑
  - [ ] 测试平台过滤逻辑

- [ ] 6.2 集成测试
  - [ ] 测试配置保存和加载流程
  - [ ] 测试源切换流程
  - [ ] 测试版本获取和显示
  - [ ] 测试包下载流程

- [ ] 6.3 手动验证
  - [ ] 验证可以成功添加HTTP索引源
  - [ ] 验证可以正确显示版本列表
  - [ ] 验证可以正确下载和安装包
  - [ ] 验证错误处理和用户提示
  - [ ] 验证配置持久化

## 7. 文档

- [ ] 7.1 更新项目文档
  - [ ] 更新包源配置说明
  - [ ] 添加HTTP索引源配置示例
  - [ ] 记录索引文件格式要求

- [x] 7.2 代码注释
  - [x] 为新添加的代码添加清晰的注释
  - [x] 记录关键设计决策

## 8. 官方源配置

- [x] 8.1 配置生产环境默认源
  - [x] 设置官方索引URL为生产环境默认源
  - [x] 更新 `initializeDefaultSource` 方法
  - [x] 添加 `getDefaultHttpIndexSource` 方法

- [x] 8.2 适配官方索引格式
  - [x] 更新接口定义以匹配官方格式
  - [x] 修复平台提取逻辑支持 `-nort` 后缀
  - [x] 更新URL解析逻辑

- [x] 8.3 前端默认值
  - [x] 设置HTTP索引源默认URL
  - [x] 设置默认baseUrl
