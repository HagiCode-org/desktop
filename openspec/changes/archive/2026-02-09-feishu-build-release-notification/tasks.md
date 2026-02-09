# Implementation Tasks

## 1. GitHub 配置准备

### 1.1 配置飞书机器人
- [ ] 1.1.1 创建飞书机器人或使用现有机器人
  - 在飞书开放平台创建自定义机器人
  - 或使用现有的群组 Webhook
  - 获取 Webhook URL

- [ ] 1.1.2 配置机器人权限和消息格式
  - 确保机器人有发送消息权限
  - 测试 Webhook URL 有效性
  - 验证消息格式兼容性

### 1.2 添加 GitHub Secrets
- [ ] 1.2.1 在项目仓库中添加 FEISHU_WEBHOOK_URL 密钥
  - 进入仓库 Settings > Secrets and variables > Actions
  - 点击 "New repository secret"
  - Name: `FEISHU_WEBHOOK_URL`
  - Value: [飞书 Webhook URL]
  - 保存配置

## 2. 工作流文件修改

### 2.1 修改 build.yml
- [ ] 2.1.1 在 build.yml 中添加 notify-feishu job
  - 在 jobs 部分末尾添加 notify-feishu 任务
  - 设置 depends on sync-azure 任务
  - 设置 if: always() 条件

- [ ] 2.1.2 配置 notify-feishu 任务参数
  - 设置 uses: HagiCode-org/haginotifier/.github/workflows/notify.yml@main
  - 配置 with.message 参数，包含：
    - Flow 执行完成标题
    - 状态信息 (${{ job.status }})
    - 分支信息 (${{ github.ref_name }})
    - 提交 SHA (${{ github.sha }})
    - 构建结果摘要
  - 配置 with.msg_type: 'post'
  - 配置 with.title: 'Hagicode Desktop 构建通知'

- [ ] 2.1.3 配置密钥传递
  - 在 secrets 部分添加：
    - FEISHU_WEBHOOK_URL: ${{ secrets.FEISHU_WEBHOOK_URL }}

### 2.2 验证工作流语法
- [ ] 2.2.1 检查 YAML 语法正确性
  - 使用 GitHub Actions 的语法检查工具
  - 确保缩进正确
  - 确保引用语法正确

## 3. 测试和验证

### 3.1 工作流测试
- [ ] 3.1.1 手动触发工作流测试
  - 使用 workflow_dispatch 触发 build.yml
  - 观察工作流执行过程
  - 验证 notify-feishu 任务是否正确执行

- [ ] 3.1.2 验证成功通知
  - 触发一次成功的构建
  - 检查飞书是否收到成功通知
  - 验证通知内容是否正确

- [ ] 3.1.3 验证失败通知
  - 触发一次失败的构建（可临时修改构建脚本）
  - 检查飞书是否收到失败通知
  - 验证失败信息是否正确显示

### 3.2 通知内容验证
- [ ] 3.2.1 验证成功通知格式
  - 检查消息标题
  - 检查状态标识（✅）
  - 检查分支和提交信息
  - 检查 GitHub Actions 链接是否可点击

- [ ] 3.2.2 验证失败通知格式
  - 检查消息标题
  - 检查状态标识（❌）
  - 检查错误信息是否清晰
  - 检查 GitHub Actions 链接是否可点击

### 3.3 边界条件测试
- [ ] 3.3.1 测试 sync-azure 失败时的通知
  - 确保 sync-azure 失败时仍然发送通知
  - 验证通知中正确显示失败状态

- [ ] 3.3.2 测试 Webhook URL 无效时的处理
  - 临时使用无效的 Webhook URL
  - 确认工作流不会因通知失败而中断
  - 检查错误日志是否清晰

## 4. 文档更新

### 4.1 更新项目文档
- [ ] 4.1.1 更新 openspec/specs/ci-cd/spec.md
  - 添加飞书通知相关规范
  - 包含通知触发条件
  - 包含通知消息格式

### 4.2 创建配置指南
- [ ] 4.2.1 创建飞书通知配置指南
  - 说明如何配置 FEISHU_WEBHOOK_URL
  - 说明如何创建飞书机器人
  - 说明常见问题和解决方案

## 5. 代码审查

### 5.1 工作流审查
- [ ] 5.1.1 审查 build.yml 变更
  - 确认 notify-feishu 任务位置合理
  - 确认依赖关系正确
  - 确认 if: always() 条件设置正确

- [ ] 5.1.2 安全审查
  - 确认 Webhook URL 不会泄露到日志
  - 确认通知内容不包含敏感信息

### 5.2 验证通过后
- [ ] 5.2.1 提交变更
  - 创建提交
  - 推送到远程仓库
  - 创建 Pull Request（如果需要）

- [ ] 5.2.2 合并到主分支
  - 等待代码审查
  - 合并到主分支
  - 监控后续构建的通知是否正常

## 6. 后续优化（可选）

### 6.1 通知内容增强
- [ ] 6.1.1 添加更多构建信息
  - 构建耗时
  - 各平台构建结果详情
  - 发布文件列表

- [ ] 6.1.2 支持自定义通知内容
  - 允许通过配置自定义消息格式
  - 支持添加自定义标签和分类

### 6.2 通知渠道扩展
- [ ] 6.2.1 支持多个通知渠道
  - 添加其他通知方式（如邮件、钉钉等）
  - 统一通知接口

- [ ] 6.2.2 支持不同级别的通知
  - 区分构建和发布通知
  - 支持仅失败时通知选项
