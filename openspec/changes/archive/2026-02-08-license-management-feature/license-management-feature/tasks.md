# 实施任务清单

## 1. 类型定义和基础架构

- [x] 1.1 创建 `src/types/license.ts` 定义极简的许可证相关 TypeScript 类型
  - 定义 `LicenseData` 接口（licenseKey, isConfigured, updatedAt）
  - 定义 `DEFAULT_LICENSE_KEY` 常量，值为 `'D76B5C-EC0A70-AEA453-BC9414-0A198D-V3'`

## 2. 主进程许可证管理器和配置集成

- [x] 2.1 扩展 `src/main/config.ts` 配置管理器
  - 在 `AppConfig` 接口中添加 `license` 字段
  - 定义 `LicenseConfig` 接口（licenseKey, isConfigured, updatedAt）
  - 添加 `getLicense()` 方法获取许可证配置
  - 添加 `setLicense(licenseKey)` 方法设置许可证
  - 在默认配置中添加默认许可证配置

- [x] 2.2 创建 `src/main/license-manager.ts` 许可证管理器（单例模式）
  - 实现 `getInstance()` 静态方法
  - 接收 `ConfigManager` 实例作为依赖
  - 实现 `getLicense()` 方法从 ConfigManager 获取许可证
  - 实现 `saveLicense(licenseKey)` 方法通过 ConfigManager 保存许可证
  - 实现默认许可证常量：`D76B5C-EC0A70-AEA453-BC9414-0A198D-V3`

- [x] 2.3 在应用启动时初始化许可证
  - 在 `main.ts` 的 `app.whenReady()` 中添加许可证初始化逻辑
  - 在创建 `ConfigManager` 后检查许可证是否存在
  - 如果不存在，自动设置默认许可证
  - 添加初始化日志记录

## 3. IPC 通信层

- [x] 3.1 更新 `src/main/main.ts` 注册极简的许可证 IPC 处理器
  - 注册 `license:get` 处理器（获取当前许可证）
  - 注册 `license:save` 处理器（保存许可证）
  - 使用 LicenseManager 单例处理请求
  - 添加错误处理和日志记录

- [x] 3.2 更新 `src/preload/index.ts` 暴露极简的许可证 API
  - 添加 `license.get()` 方法
  - 添加 `license.save(licenseKey)` 方法

## 4. Redux 状态管理

- [x] 4.1 创建 `src/renderer/store/slices/licenseSlice.ts`
  - 定义极简的 `LicenseState` 接口（单一许可证）
  - 添加 `license` 可选字段存储当前许可证
  - 添加 `loading` 状态
  - 添加 `error` 状态
  - 创建 `setLicense` action（设置完整许可证数据）
  - 创建 `setLoading` action
  - 创建 `setError` action

- [x] 4.2 创建 `src/renderer/store/sagas/licenseSaga.ts`
  - 监听 `FETCH_LICENSE` action（获取当前许可证）
  - 监听 `SAVE_LICENSE` action（保存许可证）
  - 实现与主进程的极简的 IPC 通信
  - 处理成功和错误情况
  - 成功后显示 Toast 提示

- [x] 4.3 更新 `src/renderer/store/index.ts`
  - 导入 license reducer
  - 将 license reducer 添加到 store 配置
  - 导入 license saga
  - 将 license saga 添加到 root saga

## 5. 视图类型更新

- [x] 5.1 更新 `src/renderer/store/slices/viewSlice.ts`
  - 在 `ViewType` 类型中添加 'license'
  - 确保新视图类型正确集成

## 6. UI 组件开发

- [x] 6.1 创建 `src/renderer/components/LicenseManagementPage.tsx` 主页面组件（极简版）
  - 创建页面布局容器
  - 添加页面标题和描述
  - 集成 Redux 状态管理
  - 实现当前许可证状态显示卡片（显示许可证密钥，部分隐藏）
  - 实现单一文本框许可证输入区域
  - 添加加载状态显示
  - 添加错误处理和用户提示
  - 使用 shadcn/ui 组件保持 UI 一致性
  - 预填充默认许可证密钥到输入框

## 7. 导航集成

- [x] 7.1 更新 `src/renderer/components/SidebarNavigation.tsx`
  - 在 `navigationItems` 数组中添加许可证管理菜单项
  - 导入合适的图标（Key 图标）
  - 确保正确的国际化 key 引用

## 8. 国际化支持

- [x] 8.1 更新 `src/renderer/i18n/locales/zh-CN/components.json`
  - 添加 `licenseManagement` 翻译组
  - 添加菜单项翻译 `sidebar.licenseManagement`
  - 添加许可证状态相关翻译
  - 添加表单字段翻译
  - 添加按钮和操作翻译
  - 添加成功/错误提示翻译

- [x] 8.2 更新 `src/renderer/i18n/locales/en-US/components.json`
  - 添加对应的英文翻译
  - 保持与中文翻译一致的结构

- [x] 8.3 更新 `src/renderer/i18n/locales/zh-CN/common.json`（如果需要）
  - 添加 `sidebar` 命名空间下的相关翻译

- [x] 8.4 更新 `src/renderer/i18n/locales/en-US/common.json`（如果需要）
  - 添加对应的英文翻译

## 9. 测试和验证

- [x] 9.1 手动测试许可证获取功能
  - 验证首次启动时自动设置默认许可证
  - 验证已配置时显示正确状态
  - 验证许可证密钥部分隐藏显示

- [x] 9.2 手动测试许可证保存功能
  - 验证更新许可证功能正常
  - 验证保存成功后状态更新

- [x] 9.3 验证导航功能
  - 验证侧边栏菜单项正确显示
  - 验证点击后正确切换到许可证管理页面
  - 验证当前视图高亮正确

- [x] 9.4 验证应用启动时许可证初始化
  - 验证首次启动时自动设置默认许可证
  - 验证后续启动时正确加载已有许可证
  - 验证许可证配置正确保存到 electron-store

- [x] 9.5 验证国际化功能
  - 验证中英文切换正常
  - 验证所有文本正确翻译

## 10. 文档和清理

- [x] 10.1 代码审查
  - 检查代码风格一致性
  - 检查 TypeScript 类型安全
  - 检查错误处理完整性
  - 确认实现了极简原则（无许可证类型识别）
  - 确认许可证正确集成到 ConfigManager
  - 确认应用启动时许可证初始化逻辑正确

- [x] 10.2 性能检查
  - 验证没有不必要的重复渲染
  - 验证 IPC 调用效率

- [x] 10.3 可访问性检查
  - 验证键盘导航
  - 验证屏幕阅读器支持
  - 验证输入框标签正确

- [x] 10.4 确认极简实现
  - 确认只有单一全局许可证
  - 确认界面简化为单文本框
  - 确认无许可证类型相关内容
  - 确认默认许可证已正确配置
