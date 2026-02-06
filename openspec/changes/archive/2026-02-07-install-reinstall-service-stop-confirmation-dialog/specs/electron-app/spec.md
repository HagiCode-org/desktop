## ADDED Requirements

### Requirement: 服务操作二次确认

当用户执行可能影响运行中服务的操作时，系统 SHALL 提供二次确认机制。

#### Scenario: 安装包时服务正在运行
- **WHEN** 用户点击安装按钮且 Web 服务状态为 `running`
- **THEN** 系统应显示确认对话框，告知用户需要停止服务
- **AND** 对话框应包含"取消"和"停止并继续"两个操作按钮
- **AND** 用户点击"停止并继续"后，系统应先停止服务，然后执行安装
- **AND** 用户点击"取消"后，系统应关闭对话框且不执行任何操作

#### Scenario: 重装包时服务正在运行
- **WHEN** 用户点击重装按钮且 Web 服务状态为 `running`
- **THEN** 系统应显示确认对话框，告知用户需要停止服务
- **AND** 对话框应包含"取消"和"停止并继续"两个操作按钮
- **AND** 用户点击"停止并继续"后，系统应先停止服务，然后执行重装

#### Scenario: 服务未运行时安装
- **WHEN** 用户点击安装按钮且 Web 服务状态不为 `running`
- **THEN** 系统应直接执行安装操作，不显示确认对话框
- **AND** 安装流程不应被中断

#### Scenario: 服务停止失败
- **WHEN** 用户确认停止服务但服务停止操作失败
- **THEN** 系统应显示错误提示，告知用户停止服务失败
- **AND** 系统不应继续执行安装操作
- **AND** 确认对话框应保持打开状态或显示重试选项

### Requirement: 安装确认状态管理

系统 SHALL 提供确认对话框的状态管理，包括对话框显示/隐藏状态和待安装版本信息。

#### Scenario: 显示确认对话框
- **WHEN** 安装操作检测到服务正在运行
- **THEN** Redux store 应更新 `showConfirmDialog` 状态为 `true`
- **AND** Redux store 应保存 `pendingInstallVersion` 为待安装的版本 ID

#### Scenario: 隐藏确认对话框
- **WHEN** 用户点击取消按钮
- **THEN** Redux store 应更新 `showConfirmDialog` 状态为 `false`
- **AND** Redux store 应清除 `pendingInstallVersion` 信息

#### Scenario: 确认并继续安装
- **WHEN** 用户点击"停止并继续"按钮
- **THEN** Redux store 应更新 `showConfirmDialog` 状态为 `false`
- **AND** 系统应使用保存的 `pendingInstallVersion` 执行安装操作
