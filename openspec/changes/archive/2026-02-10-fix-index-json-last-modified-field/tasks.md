## 1. 调查和验证

- [x] 1.1 分析当前 index.json 生成逻辑，确认 lastModified 字段为空的原因
- [x] 1.2 检查 Azure Storage API 返回的 Blob 元数据格式
- [x] 1.3 验证 Azure Storage 的 `lastModified` 属性格式和可用性

## 2. 修复 index.json 生成逻辑

- [x] 2.1 修改 `.github/workflows/sync-azure-storage.yml` 中的 jq 脚本
- [x] 2.2 确保 assets 数组中每个元素都包含正确的 lastModified 字段
- [x] 2.3 验证时间戳格式为 ISO 8601 标准
- [x] 2.4 实现后备方案：当 Azure lastModified 不可用时，使用 GitHub Release 的 `published_at` 时间
- [x] 2.5 添加 GitHub Release API 调用以获取 `published_at` 数据（如需要）

## 3. 本地测试

- [x] 3.1 使用示例数据测试 jq 脚本逻辑
- [x] 3.2 验证生成的 JSON 格式正确且字段完整
- [x] 3.3 确认压缩输出 (jq -c) 不影响数据完整性
- [x] 3.4 测试后备方案：模拟 lastModified 为空的情况，验证使用创建时间覆盖

## 4. 提交和验证

- [ ] 4.1 提交修改到 PR 分支
- [ ] 4.2 等待 PR 检查通过
- [ ] 4.3 合并后手动触发 Azure 同步工作流验证修复效果
- [ ] 4.4 下载生成的 index.json 确认 lastModified 字段正确填充

## 5. 客户端验证

- [ ] 5.1 在开发环境测试 HTTP Index 包源读取
- [ ] 5.2 确认 UI 中版本时间正确显示
- [ ] 5.3 验证版本比较和更新检测逻辑正常工作
