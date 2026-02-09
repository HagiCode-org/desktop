# i18n and Onboarding Specification Delta

This delta describes changes to the internationalization and onboarding capabilities to improve button text clarity and ensure reliable wizard launch from the dashboard when no versions are installed.

## ADDED Requirements

### Requirement: 系统管理视图首页空状态按钮文案

系统管理视图（首页）的空状态界面 MUST 使用明确标识 Onboarding 向导流程的按钮文案。

#### Scenario: 中文界面显示首页空状态按钮

**Given** 用户选择中文作为应用语言
**And** 用户在系统管理视图（首页）
**And** 用户没有任何已安装的 Hagicode Server 版本
**When** 空状态界面渲染完成
**Then** 按钮文本显示为 "启动向导" 或 "启动引导向导"
**And** 按钮文案明确表明点击后将启动引导向导流程
**And** 翻译键为 `system.noVersionInstalled.startWizard`

#### Scenario: 英文界面显示首页空状态按钮

**Given** 用户选择英文作为应用语言
**And** 用户在系统管理视图（首页）
**And** 用户没有任何已安装的 Hagicode Server 版本
**When** 空状态界面渲染完成
**Then** 按钮文本显示为 "Launch Wizard" 或 "Start Setup Wizard"
**And** 按钮文案明确表明点击后将启动 setup wizard 流程
**And** 翻译键为 `system.noVersionInstalled.startWizard`

### Requirement: 首页按钮可靠启动向导

首页的"启动向导"按钮 MUST 能够可靠地启动 Onboarding 向导，无论用户之前的向导状态如何。

#### Scenario: 首次用户点击启动向导

**Given** 用户首次使用应用（无向导历史记录）
**And** 用户在首页空状态界面
**When** 用户点击"启动向导"按钮
**Then** 调用 `resetOnboarding()` API 重置向导状态
**And** 调用 `checkTriggerCondition()` API 检查触发条件
**And** 导航到版本管理页面
**And** Onboarding 向导自动显示

#### Scenario: 用户之前跳过向导后点击启动向导

**Given** 用户之前跳过了 Onboarding 向导（isSkipped = true）
**And** 用户在首页空状态界面
**When** 用户点击"启动向导"按钮
**Then** 调用 `resetOnboarding()` API 清除 isSkipped 标志
**And** 调用 `checkTriggerCondition()` API 检查触发条件
**And** shouldShow 返回 true（因为状态已重置）
**And** 导航到版本管理页面
**And** **Onboarding 向导可靠启动并显示**

#### Scenario: 用户之前完成向导后点击启动向导

**Given** 用户之前完成了 Onboarding 向导（isCompleted = true）
**And** 用户在首页空状态界面（例如卸载了所有版本后）
**When** 用户点击"启动向导"按钮
**Then** 调用 `resetOnboarding()` API 清除 isCompleted 标志
**And** 调用 `checkTriggerCondition()` API 检查触发条件
**And** shouldShow 返回 true（因为状态已重置）
**And** 导航到版本管理页面
**And** **Onboarding 向导可靠启动并显示**

#### Scenario: 按钮点击失败处理

**Given** 用户在首页空状态界面
**When** 用户点击"启动向导"按钮
**And** resetOnboarding 或 checkTriggerCondition 调用失败
**Then** 显示错误提示消息
**And** 不执行导航操作
**And** 用户可以重试点击按钮

## MODIFIED Requirements

None

## REMOVED Requirements

None

## RENAMED Requirements

None
