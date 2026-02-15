# ci-cd Specification Delta

## ADDED Requirements

### Requirement: 发布渠道配置支持

CI/CD 工作流 MUST 支持在发布过程中指定渠道（channel）参数，用于区分 stable、beta、dev 等不同发布渠道的版本。

#### Scenario: 主分支发布自动设置 stable 渠道

**Given** 代码合并到 `main` 分支并创建版本标签（如 `v1.0.0`）
**When** 触发构建和发布工作流
**THEN** 自动设置渠道为 `stable`
**AND** 生成的 index.json 中对应版本标记为 `stable` 渠道

#### Scenario: 预发布版本设置 beta 渠道

**Given** 创建预发布版本标签（如 `v1.0.0-beta.1`）
**WHEN** 触发构建和发布工作流
**THEN** 自动设置渠道为 `beta`
**AND** 生成的 index.json 中对应版本标记为 `beta` 渠道

#### Scenario: 手动指定渠道参数

**Given** 通过 workflow_dispatch 手动触发发布
**WHEN** 用户在触发时指定渠道参数
**THEN** 使用指定的渠道值
**AND** 生成的 index.json 中对应版本使用指定渠道

---

### Requirement: index.json 渠道结构生成

Azure Storage 同步工作流 MUST 在生成 index.json 时包含完整的渠道结构信息。

#### Scenario: 生成包含 channels 对象的 index.json

**Given** 发布资源已上传到 Azure Storage
**WHEN** 执行 index.json 生成步骤
**THEN** 生成的 index.json 包含 `channels` 对象
**AND** `channels` 对象包含所有活跃渠道（stable、beta、dev 等）
**AND** 每个渠道包含 `latest` 和 `versions` 字段

#### Scenario: 版本正确映射到对应渠道

**Given** 存在多个不同渠道的版本
**WHEN** 生成 index.json
**THEN** 每个版本对象包含 `channel` 字段
**AND** 版本根据其版本号标识正确归类到对应渠道
**AND** stable 渠道包含不含预发布标识的版本
**AND** beta 渠道包含含 beta 标识的版本

#### Scenario: 更新 channels 对象的 latest 版本

**Given** 某渠道有多个版本
**WHEN** 生成 channels 对象
**THEN** 每个渠道的 `latest` 字段指向该渠道最新版本
**AND** `versions` 数组包含该渠道所有版本列表

---

### Requirement: index.json 向后兼容性

生成的 index.json MUST 保持与现有解析逻辑的向后兼容性。

#### Scenario: 不含 channels 的旧版本兼容

**Given** Desktop 客户端的 http-index-source.ts 解析 index.json
**WHEN** 读取包含 channels 对象的 index.json
**THEN** 正确解析 channels 对象结构
**AND** 为每个版本映射正确的 channel 信息
**AND** 当 channels 不存在时，将所有版本默认为 `beta` 渠道

#### Scenario: 渠道信息可选字段处理

**Given** index.json 包含 channels 对象
**WHEN** 某些版本未在 channels.versions 中列出
**THEN** 这些版本的 channel 字段为空或 undefined
**AND** 客户端容错处理，不影响版本列表显示

---

### Requirement: 飞书通知渠道信息

Azure 同步完成的飞书通知 MUST 包含发布渠道信息。

#### Scenario: 成功通知包含渠道信息

**Given** Azure Storage 同步工作流成功完成
**WHEN** 发送飞书通知
**THEN** 通知消息包含发布的渠道信息
**AND** 消息格式包含渠道名称（如 "Stable 渠道"）

#### Scenario: 不同渠道的版本统计

**Given** 发布包含多个渠道的版本
**WHEN** 发送飞书通知
**THEN** 通知消息按渠道分组显示版本统计
**AND** 显示每个渠道的最新版本信息
