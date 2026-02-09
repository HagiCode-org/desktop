# CI/CD 规范

## ADDED Requirements

### Requirement: 构建发布结果通知
系统 SHALL 在构建和发布流程完成后自动向飞书发送执行结果通知。

#### Scenario: 成功构建通知
- **WHEN** 所有构建和发布任务成功完成
- **THEN** 系统发送成功通知到飞书
- **AND** 通知包含以下信息：
  - 状态：成功（✅）
  - 分支名称
  - 提交 SHA
  - GitHub Actions 链接

#### Scenario: 失败构建通知
- **WHEN** 任一构建或发布任务失败
- **THEN** 系统发送失败通知到飞书
- **AND** 通知包含以下信息：
  - 状态：失败（❌）
  - 分支名称
  - 提交 SHA
  - 失败任务名称
  - GitHub Actions 链接

#### Scenario: 通知发送时机
- **WHEN** 同步到 Azure Storage 任务完成（无论成功或失败）
- **THEN** 系统触发飞书通知任务
- **AND** 使用 if: always() 确保通知总是发送

### Requirement: 飞书 Webhook 配置
系统 SHALL 使用安全的密钥存储机制配置飞书 Webhook URL。

#### Scenario: 配置 Webhook URL
- **WHEN** 管理员在 GitHub Secrets 中添加 FEISHU_WEBHOOK_URL
- **THEN** 系统在工作流中安全读取该密钥
- **AND** 密钥不会出现在日志或输出中

#### Scenario: Webhook URL 无效
- **WHEN** 配置的 Webhook URL 无效或无法访问
- **THEN** 通知任务失败但不影响主构建流程
- **AND** 错误信息记录在工作流日志中

### Requirement: 通知消息格式
系统 SHALL 使用结构化的富文本格式发送飞书通知。

#### Scenario: 标准消息格式
- **WHEN** 发送飞书通知
- **THEN** 消息包含以下结构：
  - 标题：Hagicode Desktop 构建通知
  - 状态图标：成功（✅）或失败（❌）
  - 执行结果摘要
  - 可点击的 GitHub Actions 链接

#### Scenario: 消息类型配置
- **WHEN** 调用 haginotifier 工作流
- **THEN** 使用 msg_type: 'post' 参数
- **AND** 支持富文本格式和链接
