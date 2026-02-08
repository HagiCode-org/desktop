# 压缩客户端 index.json 文件

## 概述

在 GitHub Actions CI/CD 流程中生成的 `index.json` 文件当前未进行压缩处理，导致文件体积较大且影响加载性能。本提案旨在优化 `index.json` 文件的生成流程，通过压缩 JSON 减小文件体积并提升客户端加载性能。

## 问题背景

### 当前状态

- **生成位置**：`.github/workflows/sync-azure-storage.yml` 工作流
- **生成方式**：使用 `jq` 工具生成 JSON，默认输出格式化的 JSON
- **文件位置**：Azure Blob Storage 容器根目录下的 `index.json`

### 问题分析

1. **不必要的空白字符**：当前生成的 JSON 包含空格、换行和缩进，这些对解析无用的字符增加了文件体积
2. **加载性能影响**：客户端启动时需要下载和解析 `index.json`，较大的文件会延长加载时间
3. **存储成本**：虽然单个文件影响有限，但在高频访问场景下会累积带宽和存储成本

## 解决方案

### 实施方案

在 `sync-azure-storage.yml` 工作流的 "Generate and upload index file" 步骤中，使用 `jq -c` 参数生成压缩格式的 JSON。

### 具体变更

**修改位置**：`.github/workflows/sync-azure-storage.yml` 第 179 行

**变更内容**：
```bash
# 修改前
echo "$INDEX_JSON" | jq . > index.json

# 修改后
echo "$INDEX_JSON" | jq -c . > index.json
```

### 技术细节

- **jq -c 参数**：输出紧凑格式的 JSON（compressed），移除所有空白字符
- **向后兼容**：压缩后的 JSON 内容完全相同，客户端解析逻辑无需修改
- **安全性**：不改变数据结构，仅优化输出格式

## 影响范围

### 受影响组件

| 组件 | 影响类型 | 说明 |
|------|----------|------|
| `sync-azure-storage.yml` | 修改 | 添加 `-c` 参数到 jq 命令 |
| 客户端应用 | 无需修改 | JSON 解析逻辑保持不变 |
| Azure Blob Storage | 文件更新 | index.json 文件体积减小 |

### 兼容性

- **客户端解析**：标准 JSON 解析器（`JSON.parse()`）完全兼容压缩格式
- **现有功能**：不影响任何现有功能，仅优化文件格式

## 预期收益

1. **文件体积减少**：预计减少 20-40% 的文件体积（取决于 JSON 结构复杂度）
2. **加载性能提升**：网络传输时间减少，解析时间略微缩短
3. **用户体验改善**：应用启动时的资源加载更快

## 实施计划

详见 [tasks.md](./tasks.md)

## 验证标准

1. **功能验证**：生成的 `index.json` 能被客户端正确解析
2. **体积验证**：新文件体积明显小于压缩前
3. **内容验证**：JSON 内容结构完全一致
4. **流程验证**：CI/CD 工作流成功完成，无错误

## 风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| JSON 格式错误 | 低 | 中 | 添加 jq 输出验证步骤 |
| 客户端解析失败 | 极低 | 高 | JSON 是标准格式，向后兼容 |
| CI/CD 流程失败 | 低 | 中 | 在测试环境验证后再部署 |

## 参考资料

- [jq 手册 - compact output](https://stedolan.github.io/jq/manual/#v4)
- 项目文件：`.github/workflows/sync-azure-storage.yml`
