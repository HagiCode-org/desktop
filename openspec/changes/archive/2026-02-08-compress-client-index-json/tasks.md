# 实施任务清单

## 任务概述

本清单包含实施"压缩客户端 index.json 文件"提案所需的所有任务。任务按执行顺序排列，标记了依赖关系和验证步骤。

---

## 任务列表

### 1. 修改工作流文件

**文件**: `.github/workflows/sync-azure-storage.yml`

**操作**: 在第 179 行修改 `jq` 命令，添加 `-c` 参数

```diff
- echo "$INDEX_JSON" | jq . > index.json
+ echo "$INDEX_JSON" | jq -c . > index.json
```

**验证**:
- [ ] 修改后的命令语法正确
- [ ] YAML 缩进保持一致

---

### 2. 本地测试 JSON 压缩效果

**操作**: 在本地环境验证 `jq -c` 的输出效果

**命令**:
```bash
# 创建测试 JSON
echo '{"key": "value", "nested": {"array": [1, 2, 3]}}' | jq .

# 测试压缩输出
echo '{"key": "value", "nested": {"array": [1, 2, 3]}}' | jq -c .

# 验证压缩前后内容一致
echo '{"key": "value", "nested": {"array": [1, 2, 3]}}' | jq -c . | jq .
```

**验证**:
- [ ] 压缩输出为单行
- [ ] 解压后内容与原始内容一致

---

### 3. 添加 JSON 有效性验证

**目的**: 确保压缩后的 JSON 格式有效且可解析

**操作**: 在工作流中添加验证步骤

在 "Generate and upload index file" 步骤中，生成 index.json 后添加验证：

```bash
# 验证生成的 JSON 格式有效
echo "Validating generated index.json..."
if ! jq empty index.json; then
  echo "::error::Generated index.json is not valid JSON"
  exit 1
fi
echo "JSON validation passed"
```

**验证**:
- [ ] 验证逻辑能检测无效 JSON
- [ ] 有效 JSON 能通过验证

---

### 4. 更新工作流（添加验证步骤）

**文件**: `.github/workflows/sync-azure-storage.yml`

**位置**: 在 "Generate and upload index file" 步骤中，第 179 行后添加

```yaml
# 验证生成的 JSON
echo "Validating index.json..."
if ! jq empty index.json; then
  echo "::error::Generated index.json is not valid JSON"
  exit 1
fi
echo "index.json validation passed"
```

**验证**:
- [ ] YAML 语法正确
- [ ] 缩进与周围代码一致

---

### 5. 创建测试分支

**命令**:
```bash
git checkout -b feature/compress-index-json
```

**验证**:
- [ ] 分支创建成功
- [ ] 基于正确的基准分支（main）

---

### 6. 提交变更

**命令**:
```bash
git add .github/workflows/sync-azure-storage.yml
git commit -m "feat: compress index.json output for reduced file size"
```

**验证**:
- [ ] 只包含预期的文件变更
- [ ] 提交信息清晰准确

---

### 7. 推送到远程仓库

**命令**:
```bash
git push -u origin feature/compress-index-json
```

**验证**:
- [ ] 推送成功
- [ ] 远程分支创建成功

---

### 8. 创建 Pull Request

**内容**:

**标题**: `feat: compress index.json output for reduced file size`

**描述模板**:
```markdown
## 概述
- 在 `sync-azure-storage.yml` 工作流中添加 JSON 压缩
- 使用 `jq -c` 参数生成紧凑格式的 `index.json`

## 变更内容
- 修改 jq 输出参数，添加 `-c` 选项
- 添加 JSON 有效性验证步骤

## 预期收益
- 减少 index.json 文件体积 20-40%
- 提升客户端加载性能

## 验证
- [ ] 本地测试 jq -c 输出正确
- [ ] JSON 格式验证通过
```

**验证**:
- [ ] PR 创建成功
- [ ] 关联到正确的 OpenSpec 提案

---

### 9. 代码审查

**检查项**:
- [ ] 变更范围与提案一致
- [ ] YAML 语法正确
- [ ] 验证逻辑完整
- [ ] 无意外的副作用

---

### 10. 合并到主分支

**前提条件**:
- 代码审查通过
- CI 检查通过

**操作**:
- 通过 GitHub UI 合并 PR
- 使用 "Squash and merge" 保持提交历史清洁

**验证**:
- [ ] 合并成功
- [ ] 主分支包含变更

---

### 11. 验证生产环境

**操作**: 触发一次 release 流程，观察 `sync-azure-storage` 工作流执行

**检查项**:
- [ ] 工作流成功完成
- [ ] index.json 生成无错误
- [ ] JSON 验证步骤通过
- [ ] Azure Storage 中的文件已更新

---

### 12. 验证客户端兼容性

**操作**: 使用新版本的 index.json 测试客户端应用

**检查项**:
- [ ] 客户端能正确下载 index.json
- [ ] JSON 解析成功
- [ ] 应用启动和功能正常

---

### 13. 性能对比验证

**操作**: 对比压缩前后的文件体积和加载时间

**数据收集**:
- [ ] 压缩前文件大小（从历史记录获取）
- [ ] 压缩后文件大小
- [ ] 压缩率计算
- [ ] 加载时间对比（可选）

---

### 14. 清理和总结

**操作**:
- [ ] 删除功能分支
- [ ] 更新 OpenSpec 提案状态为已完成
- [ ] 记录性能改进数据

**最终验证**:
- [ ] Git 仓库状态清洁
- [ ] 提案文档完整
- [ ] 团队已知晓变更

---

## 任务依赖关系

```
任务 1 ──┬──> 任务 3 ──> 任务 4 ──> 任务 5 ──> 任务 6 ──> 任务 7 ──> 任务 8
         │                                                    │
         └──> 任务 2 ─────────────────────────────────────────┘
                                                                   │
任务 9 <────────────────────────────────────────────────────────────┘
   │
任务 10 ──> 任务 11 ──> 任务 12 ──> 任务 13 ──> 任务 14
```

---

## 完成标准

所有任务完成后，应满足以下条件：

1. ✅ `index.json` 文件以压缩格式生成
2. ✅ 文件体积减少 20% 以上
3. ✅ 客户端应用功能完全正常
4. ✅ CI/CD 流程稳定运行
5. ✅ 代码审查通过并合并
6. ✅ 提案文档更新完成
