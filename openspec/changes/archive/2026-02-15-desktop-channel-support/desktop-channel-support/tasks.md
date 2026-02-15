# Desktop Channel Support - Implementation Tasks

## 1. 渠道配置基础设施

- [ ] 1.1 在 `build.yml` 工作流中添加渠道参数环境变量
- [ ] 1.2 实现渠道自动判定逻辑（main 分支/v*.*.* 标签 -> stable，其他 -> beta）
- [ ] 1.3 在 `sync-azure-storage.yml` 中添加渠道参数接收
- [ ] 1.4 验证渠道参数在 CI/CD 流程中正确传递

## 2. index.json 生成逻辑改造

- [ ] 2.1 分析现有 index.json 生成脚本（sync-azure-storage.yml 第 143-222 行）
- [ ] 2.2 修改 jq 脚本，为每个版本添加 `channel` 字段
- [ ] 2.3 实现按渠道分组的版本聚合逻辑
- [ ] 2.4 生成 `channels` 对象结构（包含 latest 和 versions）
- [ ] 2.5 保持向后兼容性（支持 channels 为空的情况）

## 3. 渠道到版本的映射逻辑

- [ ] 3.1 确定版本到渠道的映射规则（基于版本号字符串）
- [ ] 3.2 实现 stable 版本识别（不含 beta/alpha/rc 等预发布标识）
- [ ] 3.3 实现 beta 版本识别（含 beta 标识）
- [ ] 3.4 实现 dev/alpha 版本识别（含 alpha/dev 标识）
- [ ] 3.5 测试各种版本号的正确分类

## 4. CI/CD 工作流更新

- [ ] 4.1 更新 `build.yml` 添加渠道环境变量
- [ ] 4.2 更新 `sync-azure-storage.yml` 接收渠道参数
- [ ] 4.3 在 index.json 生成步骤中使用渠道信息
- [ ] 4.4 更新飞书通知，包含渠道信息
- [ ] 4.5 验证完整发布流程

## 5. 测试与验证

- [ ] 5.1 手动触发 CI/CD 测试 stable 渠道发布
- [ ] 5.2 手动触发 CI/CD 测试 beta 渠道发布
- [ ] 5.3 验证生成的 index.json 结构正确
- [ ] 5.4 验证 http-index-source.ts 正确解析 channels
- [ ] 5.5 测试向后兼容性（模拟无 channels 的 index.json）
- [ ] 5.6 在 Desktop 客户端验证版本列表显示渠道信息

## 6. 文档更新

- [ ] 6.1 更新 `openspec/specs/ci-cd/spec.md` 添加渠道支持规范
- [ ] 6.2 更新项目文档，记录渠道配置方法
- [ ] 6.3 创建渠道测试指南
