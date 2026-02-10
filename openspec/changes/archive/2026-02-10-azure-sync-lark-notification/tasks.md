# Implementation Tasks

## 1. 依赖验证

### 1.1 确认现有配置
- [ ] 1.1.1 确认 FEISHU_WEBHOOK_URL 已配置
  - 验证仓库 Secrets 中存在 FEISHU_WEBHOOK_URL
  - 确认该密钥在 build.yml 中正常工作
  - 记录现有的飞书通知格式和样式

- [ ] 1.1.2 确认 haginotifier 版本和用法
  - 确认项目使用 HagiCode-org/haginotifier@v1.0.0
  - 参考 build.yml 中的通知实现方式
  - 确认消息格式参数（msg_type, title, message）

## 2. 工作流文件修改

### 2.1 修改 sync-azure-storage.yml
- [ ] 2.1.1 添加输出参数到 sync-to-azure job
  - 在 sync-to-azure 任务末尾添加输出步骤
  - 输出版本号 (release_tag)
  - 输出上传文件数量
  - 输出 Azure Storage 路径
  - 输出同步状态 (success/failure)

- [ ] 2.1.2 在 sync-azure-storage.yml 中添加 azure-sync-notification job
  - 在 jobs 部分添加 azure-sync-notification 任务
  - 设置 needs: sync-to-azure
  - 设置 if: always() 条件
  - 设置权限: contents: read

- [ ] 2.1.3 配置 azure-sync-notification 任务参数
  - 设置 uses: HagiCode-org/haginotifier@v1.0.0
  - 配置 with.message 参数，包含：
    - Azure 同步完成标题
    - 同步状态（基于 sync-to-azure 的输出）
    - 版本信息 (${{ needs.sync-to-azure.outputs.tag }})
    - 上传文件数量 (${{ needs.sync-to-azure.outputs.file_count }})
    - Azure Storage 路径 (${{ needs.sync-to-azure.outputs.blob_path }})
    - 提交 SHA (${{ github.sha }})
    - 触发者 (${{ github.actor }})
    - GitHub Actions 链接
  - 配置 with.msg_type: 'post'
  - 配置 with.title: 'Azure 同步完成 ${{ status_icon }}'

- [ ] 2.1.4 配置密钥传递
  - 确认通过 secrets: inherit 继承 FEISHU_WEBHOOK_URL
  - 验证密钥不会被打印到日志

### 2.2 修改 sync-to-azure job 添加输出
- [ ] 2.2.1 在 sync-to-azure job 末尾添加输出步骤
  - 添加 "Export outputs" 步骤
  - 输出 tag: ${{ steps.release_info.outputs.tag }}
  - 输出 file_count: 计算上传的文件数量
  - 输出 blob_path: Azure Storage 路径
  - 输出 storage_account: 存储账户名称

## 3. 测试和验证

### 3.1 工作流测试
- [ ] 3.1.1 验证 YAML 语法正确性
  - 使用 GitHub Actions 的语法检查工具
  - 确保缩进正确
  - 确保引用语法正确

- [ ] 3.1.2 测试手动触发工作流
  - 使用 workflow_dispatch 触发 sync-azure-storage.yml
  - 观察工作流执行过程
  - 验证 azure-sync-notification 任务是否正确执行

- [ ] 3.1.3 测试完整发布流程
  - 创建并推送一个测试版本标签
  - 等待 build.yml 完成
  - 等待 sync-azure-storage.yml 执行
  - 验证通知是否在同步完成后发送

### 3.2 通知内容验证
- [ ] 3.2.1 验证成功通知格式
  - 触发一次成功的 Azure 同步
  - 检查飞书是否收到成功通知
  - 验证消息标题包含 "✅ Azure 同步完成"
  - 验证版本信息正确显示
  - 验证上传文件数量正确
  - 验证 Azure Storage 路径正确
  - 验证 GitHub Actions 链接可点击

- [ ] 3.2.2 验证失败通知格式
  - 临时配置无效的 SAS URL 触发同步失败
  - 检查飞书是否收到失败通知
  - 验证消息标题包含 "❌ Azure 同步失败"
  - 验证错误信息清晰
  - 验证排查建议合理

### 3.3 边界条件测试
- [ ] 3.3.1 测试同步部分成功的情况
  - 模拟部分文件上传失败的场景
  - 确认通知正确反映部分失败状态

- [ ] 3.3.2 测试 Webhook URL 无效时的处理
  - 临时使用无效的 Webhook URL
  - 确认同步流程不会因通知失败而中断
  - 检查错误日志是否清晰

- [ ] 3.3.3 测试 workflow_dispatch 手动触发
  - 通过 workflow_dispatch 手动触发 sync-azure
  - 验证通知仍然正常工作
  - 验证消息中标识为手动触发

## 4. 文档更新

### 4.1 更新项目文档
- [ ] 4.1.1 更新 openspec/specs/ci-cd/spec.md
  - 添加 Azure 同步通知相关规范
  - 说明通知触发条件（sync-azure 工作流完成时）
  - 包含通知消息格式和字段说明

### 4.2 创建配置指南
- [ ] 4.2.1 更新 CI/CD 配置文档
  - 说明 Azure 同步通知的工作原理
  - 说明如何复用现有的 FEISHU_WEBHOOK_URL
  - 说明通知消息格式和自定义方法

## 5. 代码审查

### 5.1 工作流审查
- [ ] 5.1.1 审查 sync-azure-storage.yml 变更
  - 确认 azure-sync-notification 任务位置合理
  - 确认依赖关系正确 (needs: sync-to-azure)
  - 确认 if: always() 条件设置正确
  - 确认输出参数正确传递

- [ ] 5.1.2 安全审查
  - 确认 Webhook URL 不会泄露到日志
  - 确认通知内容不包含敏感信息（如完整 SAS URL）
  - 确认 Azure Storage 路径信息不会暴露敏感凭证

### 5.2 验证通过后
- [ ] 5.2.1 提交变更
  - 创建功能分支
  - 提交变更到分支
  - 推送到远程仓库

- [ ] 5.2.2 创建 Pull Request
  - 创建 PR 描述变更内容
  - 关联此 Change Proposal
  - 等待代码审查

- [ ] 5.2.3 合并到主分支
  - 等待代码审查通过
  - 合并到主分支
  - 监控后续发布的通知是否正常

## 6. 监控和优化（可选）

### 6.1 监控通知效果
- [ ] 6.1.1 收集反馈
  - 向团队收集通知格式反馈
  - 记录通知的及时性和准确性
  - 识别需要改进的地方

- [ ] 6.1.2 分析通知失败情况
  - 监控 haginotifier 执行失败率
  - 记录失败原因和解决方案
  - 建立通知失败的响应机制

### 6.2 通知内容优化
- [ ] 6.2.1 添加更多同步信息
  - 同步耗时
  - 文件大小统计
  - index.json 更新状态

- [ ] 6.2.2 支持自定义通知内容
  - 允许通过配置自定义消息格式
  - 支持不同环境使用不同的通知格式

### 6.3 通知渠道扩展
- [ ] 6.3.1 支持多个通知渠道
  - 添加其他通知方式（如 Slack、Teams 等）
  - 统一通知接口

- [ ] 6.3.2 支持不同级别的通知
  - 区分同步成功和失败的通知优先级
  - 支持仅失败时通知选项
