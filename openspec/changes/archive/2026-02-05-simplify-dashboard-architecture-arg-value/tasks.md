## 1. Implementation

### Phase 1: 代码清理和移除（准备阶段）
- [ ] 1.1 分析并记录 Remote 功能相关代码位置
- [ ] 1.2 从 SystemManagementView.tsx 中移除 Remote Server Card 相关代码（行 118-176）
- [ ] 1.3 从国际化文件中移除 remoteServer 相关翻译键
- [ ] 1.4 验证移除后应用可以正常启动

### Phase 2: 简化首页（Dashboard 重构）
- [ ] 2.1 重构 SystemManagementView.tsx，移除 PackageManagementCard 引用
- [ ] 2.2 重构 SystemManagementView.tsx，移除 DependencyManagementCard 引用
- [ ] 2.3 保留 WebServiceStatusCard 和设置面板
- [ ] 2.4 更新首页布局，简化视觉层次
- [ ] 2.5 更新国际化文件，调整首页相关文本
- [ ] 2.6 测试首页功能完整性

### Phase 3: 创建独立页面
- [ ] 3.1 创建 DependencyManagementPage.tsx 组件
- [ ] 3.2 将 PackageManagementCard 集成到 DependencyManagementPage
- [ ] 3.3 将 DependencyManagementCard 集成到 DependencyManagementPage
- [ ] 3.4 添加页面头部和导航
- [ ] 3.5 创建 VersionManagementPage.tsx 组件（预留框架）
- [ ] 3.6 添加页面路由类型定义到 viewSlice

### Phase 4: 菜单和路由集成
- [ ] 4.1 更新 viewSlice，添加 'dependency' 和 'version' 路由类型
- [ ] 4.2 修改 App.tsx，添加新页面的路由渲染逻辑
- [ ] 4.3 更新 Electron 顶部菜单配置，添加"依赖项管理"菜单项
- [ ] 4.4 更新 Electron 顶部菜单配置，添加"版本管理"菜单项
- [ ] 4.5 实现菜单点击事件到页面切换的 IPC 通信
- [ ] 4.6 测试菜单导航功能

### Phase 5: Redux 和 IPC 清理
- [ ] 5.1 检查并清理 webServiceSlice 中的 Remote 相关状态（如有）
- [ ] 5.2 检查并清理 viewSlice 中的冗余状态
- [ ] 5.3 从 main.ts 中移除 Remote 相关的 IPC 处理器
- [ ] 5.4 验证 IPC 通道完整性，确保包管理功能正常
- [ ] 5.5 运行类型检查，修复类型错误

### Phase 6: 国际化和翻译
- [ ] 6.1 添加 DependencyManagementPage 相关翻译键（zh-CN）
- [ ] 6.2 添加 DependencyManagementPage 相关翻译键（en-US）
- [ ] 6.3 添加 VersionManagementPage 相关翻译键（预留）
- [ ] 6.4 从 common.json 中移除 remoteServer 相关翻译
- [ ] 6.5 验证语言切换功能

### Phase 7: 测试和验证
- [ ] 7.1 单元测试：验证 Dashboard 组件功能
- [ ] 7.2 单元测试：验证 DependencyManagementPage 组件功能
- [ ] 7.3 集成测试：验证菜单导航切换
- [ ] 7.4 集成测试：验证包管理功能在独立页面正常工作
- [ ] 7.5 集成测试：验证 Web 服务控制功能正常
- [ ] 7.6 回归测试：确保无破坏性变更
- [ ] 7.7 跨平台测试：Windows、macOS、Linux

### Phase 8: 文档和收尾
- [ ] 8.1 更新 README.md，反映新的导航结构
- [ ] 8.2 更新 project.md，记录架构变更
- [ ] 8.3 代码审查和优化
- [ ] 8.4 提交变更并创建 Pull Request

## 2. Validation

- [ ] 2.1 所有 OpenSpec 验证通过
- [ ] 2.2 TypeScript 类型检查无错误
- [ ] 2.3 应用成功启动并加载所有页面
- [ ] 2.4 用户可以完整使用所有功能（Web 服务控制、包管理、依赖检测）
- [ ] 2.5 菜单导航工作正常
- [ ] 2.6 无控制台错误或警告
- [ ] 2.7 国际化正常工作（中英文切换）
