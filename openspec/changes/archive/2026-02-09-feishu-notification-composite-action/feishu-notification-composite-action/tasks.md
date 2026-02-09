# Implementation Tasks

## 1. Composite Action 创建

- [ ] 1.1 在 HagiCode-org/haginotifier 仓库中创建 composite action 目录结构
- [ ] 1.2 编写 action.yml 文件，定义输入参数（message, msg_type, title）
- [ ] 1.3 实现发送飞书通知的核心逻辑（JavaScript/TypeScript）
- [ ] 1.4 添加错误处理和日志输出
- [ ] 1.5 创建 v1 版本标签
- [ ] 1.6 编写 composite action 的使用文档

## 2. Hagicode Desktop 工作流修改

- [ ] 2.1 备份当前 build.yml 文件
- [ ] 2.2 删除 prepare-notification job
- [ ] 2.3 删除 notify-feishu job
- [ ] 2.4 在 build-summary job 中添加通知 step
- [ ] 2.5 配置 composite action 的输入参数
- [ ] 2.6 配置 FEISHU_WEBHOOK_URL 环境变量
- [ ] 2.7 确保通知在构建成功和失败时都发送（if: always()）

## 3. 测试验证

- [ ] 3.1 在测试分支上触发构建，验证通知功能
- [ ] 3.2 验证构建成功时的通知内容
- [ ] 3.3 验证构建失败时的通知内容
- [ ] 3.4 验证非 tag 构建（无发布）时的通知
- [ ] 3.5 验证 tag 构建（有发布）时的通知
- [ ] 3.6 检查飞书消息格式是否正确
- [ ] 3.7 确认通知发送失败不影响构建流程

## 4. 文档更新

- [ ] 4.1 更新 OpenSpec 规范文件（specs/ci-cd/spec.md）
- [ ] 4.2 更新项目 README 中的 CI/CD 说明
- [ ] 4.3 记录 composite action 的使用示例
- [ ] 4.4 记录组织级别密钥配置方法

## 5. 部署和监控

- [ ] 5.1 合并修改到 main 分支
- [ ] 5.2 触发正式构建，验证生产环境通知
- [ ] 5.3 监控首次部署后的通知情况
- [ ] 5.4 根据实际情况调整通知内容格式
