# CI/CD 规范

## MODIFIED Requirements

### Requirement: 构建发布结果通知
系统 SHALL 在构建和发布流程完成后自动向飞书发送执行结果通知，使用 composite action 方式实现。

#### Scenario: 使用 Composite Action 发送成功通知
- **WHEN** 所有构建和发布任务成功完成
- **THEN** 系统使用 HagiCode-org/haginotifier@v1 composite action 发送通知到飞书
- **AND** 通知包含以下信息：
  - 状态：成功（✅）
  - 分支名称
  - 提交 SHA
  - GitHub Actions 链接

#### Scenario: 使用 Composite Action 发送失败通知
- **WHEN** 任一构建或发布任务失败
- **THEN** 系统使用 HagiCode-org/haginotifier@v1 composite action 发送通知到飞书
- **AND** 通知包含以下信息：
  - 状态：失败（❌）
  - 分支名称
  - 提交 SHA
  - 失败任务名称
  - GitHub Actions 链接

#### Scenario: 通知发送时机
- **WHEN** build-summary job 执行完成（无论成功或失败）
- **THEN** 系统在 build-summary job 的最后一步触发飞书通知
- **AND** 使用 if: always() 确保通知总是发送
- **AND** 通知步骤直接添加在 build-summary job 中，无需单独的 notification job

#### Scenario: Composite Action 调用方式
- **WHEN** 工作流需要发送飞书通知
- **THEN** 使用以下语法调用 composite action：
  ```yaml
  - name: Notify Feishu
    uses: HagiCode-org/haginotifier@v1
    with:
      message: '<通知消息内容>'
      msg_type: 'post'
      title: '<通知标题>'
    env:
      FEISHU_WEBHOOK_URL: ${{ secrets.FEISHU_WEBHOOK_URL }}
  ```

### Requirement: 飞书 Webhook 配置
系统 SHALL 使用安全的密钥存储机制配置飞书 Webhook URL，支持仓库级别或组织级别密钥。

#### Scenario: 使用仓库级别密钥
- **WHEN** 管理员在仓库 GitHub Secrets 中添加 FEISHU_WEBHOOK_URL
- **THEN** 系统通过 ${{ secrets.FEISHU_WEBHOOK_URL }} 读取该密钥
- **AND** 密钥不会出现在日志或输出中

#### Scenario: 使用组织级别密钥（推荐）
- **WHEN** HagiCode 组织配置了共享的 FEISHU_WEBHOOK_URL 密钥
- **THEN** 所有仓库可以访问该密钥
- **AND** 无需在每个仓库中单独配置
- **AND** 密钥管理更加集中和安全

#### Scenario: Webhook URL 无效
- **WHEN** 配置的 Webhook URL 无效或无法访问
- **THEN** 通知步骤失败但不影响主构建流程
- **AND** 错误信息记录在工作流日志中
- **AND** 构建流程继续执行

### Requirement: 通知消息格式
系统 SHALL 使用结构化的富文本格式发送飞书通知，支持直接在 composite action 中定义消息内容。

#### Scenario: 标准消息格式
- **WHEN** 发送飞书通知
- **THEN** 消息包含以下结构：
  - 标题：Hagicode Desktop 构建通知 + 状态图标
  - 状态图标：成功（✅）或失败（❌）
  - 执行结果摘要（分支、提交、平台等）
  - 可点击的 GitHub Actions 链接

#### Scenario: 消息参数配置
- **WHEN** 调用 haginotifier composite action
- **THEN** 使用以下参数：
  - message: 通知消息内容（支持 Markdown）
  - msg_type: 'post'（使用富文本格式）
  - title: 通知标题
- **AND** 消息内容在工作流中直接构建，无需额外的 job

## REMOVED Requirements

### Requirement: Prepare Notification Job
**Reason**: Composite action 可以直接在 job 中使用，无需单独的 prepare-notification job 来构建消息。

**Migration**: 将消息构建逻辑直接集成到使用通知的 job 中，在调用 composite action 前构建消息内容。

### Requirement: Notify Feishu Job
**Reason**: Composite action 作为 step 使用，无需单独的 notify-feishu job。

**Migration**: 将 notify-feishu job 改为在使用通知的 job 中添加一个 step，直接调用 HagiCode-org/haginotifier@v1 composite action。
