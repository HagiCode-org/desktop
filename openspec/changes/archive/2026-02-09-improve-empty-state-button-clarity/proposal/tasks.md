# Change: 改进首页空状态按钮文案明确性和行为可靠性 - Implementation Tasks

## 1. 添加新的翻译键

- [x] 1.1 在中文翻译文件 `src/renderer/i18n/locales/zh-CN/common.json` 中添加新翻译键
  - [x] 添加 `system.noVersionInstalled.title` 键，值为 `"未安装任何版本"`
  - [x] 添加 `system.noVersionInstalled.description` 键，值为 `"开始使用 Hagicode Desktop 的最简单方法是通过我们的引导向导。只需几步即可完成安装和配置。"`
  - [x] 添加 `system.noVersionInstalled.startWizard` 键，值为 `"启动向导"`

- [x] 1.2 在英文翻译文件 `src/renderer/i18n/locales/en-US/common.json` 中添加新翻译键
  - [x] 添加 `system.noVersionInstalled.title` 键，值为 `"No Versions Installed Yet"`
  - [x] 添加 `system.noVersionInstalled.description` 键，值为 `"The easiest way to get started with Hagicode Desktop is through our guided setup wizard. Complete installation and configuration in just a few steps."`
  - [x] 添加 `system.noVersionInstalled.startWizard` 键，值为 `"Launch Wizard"`

## 2. 修改组件使用翻译键和增强按钮行为

- [x] 2.1 修改 `src/renderer/components/SystemManagementView.tsx` 组件
  - [x] 在第 367-374 行附近：将硬编码的空状态标题改为使用翻译键 `t('system.noVersionInstalled.title')`
  - [x] 在第 376-383 行附近：将硬编码的描述文本改为使用翻译键 `t('system.noVersionInstalled.description')`
  - [x] 在第 385-395 行附近：将硬编码的按钮文本"前往版本管理"改为使用翻译键 `t('system.noVersionInstalled.startWizard')`

- [x] 2.2 **增强按钮点击处理逻辑（关键变更）**
  - [x] 在组件中添加 `handleStartWizard` 函数（参考 VersionManagementPage.tsx 的 `handleStartOnboarding` 实现）
  - [x] 函数逻辑：
    1. 调用 `await window.electronAPI.resetOnboarding()` 重置向导状态
    2. 调用 `await window.electronAPI.checkTriggerCondition()` 检查触发条件
    3. 检查结果 `shouldShow` 是否为 true
    4. 调用 `navigateTo('version')` 导航到版本管理页面
  - [x] 将按钮的 `onClick` 事件从简单的 `navigateTo('version')` 改为调用新的 `handleStartWizard` 函数
  - [x] 添加错误处理和 toast 提示（成功/失败消息）
  - [x] 添加 toast 导入到组件
  - [x] 更新 window.electronAPI 类型声明以包含 onboarding 相关方法

## 3. 验证和测试

- [ ] 3.1 验证中文界面显示正确
  - [ ] 启动应用并切换到中文语言
  - [ ] 确保没有已安装版本（显示空状态）
  - [ ] 验证首页空状态按钮文本显示为"启动向导"

- [ ] 3.2 验证英文界面显示正确
  - [ ] 启动应用并切换到英文语言
  - [ ] 确保没有已安装版本（显示空状态）
  - [ ] 验证首页空状态按钮文本显示为更新后的英文文案

- [ ] 3.3 **关键功能测试：向导可靠启动**
  - [ ] 场景A：用户首次使用（无向导历史）
    - [ ] 点击"启动向导"按钮
    - [ ] 验证向导正常启动并显示欢迎页面
  - [ ] 场景B：用户之前跳过向导
    - [ ] 模拟用户跳过向导的场景
    - [ ] 返回首页，点击"启动向导"按钮
    - [ ] **验证向导仍能正常启动**（这是关键需求）
  - [ ] 场景C：用户之前完成向导
    - [ ] 模拟用户完成向导的场景
    - [ ] 返回首页，点击"启动向导"按钮
    - [ ] **验证向导仍能正常启动**
  - [ ] 验证向导的四步骤流程正常工作（欢迎→下载→依赖→启动）

## 4. 文档更新（如需要）

- [ ] 4.1 检查是否有相关文档需要更新
  - [ ] 用户手册或帮助文档中是否有相关截图
  - [ ] 更新相关文档以反映新的按钮文案和行为
