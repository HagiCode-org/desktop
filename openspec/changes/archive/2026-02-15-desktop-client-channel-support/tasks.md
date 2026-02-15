# 实施任务清单

## 任务顺序

本提案中的任务按依赖关系排序，应依次完成。

---

## 第一阶段：基础支持

### Task 1: 扩展数据模型定义

**优先级**: 高
**预估时间**: 30 分钟

**描述**: 在相关接口中添加 channels 和 channel 字段支持。

**步骤**:
1. 打开 `src/main/package-sources/http-index-source.ts`
2. 新增 `ChannelInfo` 接口定义
3. 在 `HttpIndexFile` 接口中添加 `channels?: Record<string, ChannelInfo>` 字段
4. 打开 `src/main/version-manager.ts`
5. 在 `Version` 接口中添加 `channel?: string` 字段

**代码结构**:
```typescript
// 新增接口
interface ChannelInfo {
  latest: string;
  versions: string[];
}

// 扩展接口
interface HttpIndexFile {
  updatedAt: string;
  versions: HttpIndexVersion[];
  channels?: Record<string, ChannelInfo>;  // 新增
}

interface Version {
  // ... 现有字段
  channel?: string;  // 新增
}
```

**验收标准**:
- [ ] `ChannelInfo` 接口正确定义
- [ ] `HttpIndexFile` 接口包含 `channels` 字段
- [ ] `Version` 接口包含 `channel` 字段
- [ ] TypeScript 编译无错误

**依赖**: 无

---

### Task 2: 实现 HttpIndexSource 的 channels 解析

**优先级**: 高
**预估时间**: 1.5 小时

**描述**: 修改 `HttpIndexSource` 类，使其能够解析顶层 `channels` 对象并将版本映射到对应渠道。

**步骤**:
1. 定位 `HttpIndexSource` 类中解析 index.json 的代码
2. 在获取到 index 数据后检查是否存在 `channels` 对象
3. 实现 channel 映射逻辑：
   - 遍历 `channels` 对象的每个键（渠道名）
   - 对于每个渠道的 `versions` 数组，找到对应的版本对象
   - 为版本对象添加 `channel` 属性
4. 实现向后兼容逻辑：当 `channels` 不存在时，所有版本默认为 `beta`
5. 确保解析逻辑对格式错误有容错处理

**代码位置**: `src/main/package-sources/http-index-source.ts`

**核心逻辑**:
```typescript
// channels 映射逻辑
if (indexFile.channels) {
  for (const [channelName, channelInfo] of Object.entries(indexFile.channels)) {
    for (const versionStr of channelInfo.versions) {
      const version = versions.find(v => v.version === versionStr);
      if (version) {
        version.channel = channelName;
      }
    }
  }
} else {
  // 向后兼容
  versions.forEach(v => v.channel = 'beta');
}
```

**验收标准**:
- [ ] 正确解析 `channels` 对象
- [ ] 每个版本正确映射到其所属渠道
- [ ] 未指定 channels 时默认所有版本为 `beta`
- [ ] 版本不在 channels.versions 中时，channel 为 undefined
- [ ] 解析错误不会导致崩溃
- [ ] 单元测试覆盖主要场景

**依赖**: Task 1

---

### Task 3: 确保版本列表携带 channel 信息

**优先级**: 高
**预估时间**: 30 分钟

**描述**: 验证从 `HttpIndexSource` 获取的版本列表正确传递 channel 信息到 `VersionManager` 和渲染进程。

**步骤**:
1. 检查 `VersionManager.getVersionList()` 方法
2. 确认 channel 字段在整个传递链路中保留
3. 如有中间转换逻辑，确保 channel 字段被正确映射
4. 验证 IPC 返回给渲染进程的数据包含 channel 字段

**代码位置**: `src/main/version-manager.ts`

**验收标准**:
- [ ] `VersionManager.getVersionList()` 返回的版本包含正确的 channel 信息
- [ ] IPC 返回给渲染进程的数据包含 channel 字段
- [ ] channel 信息在整个链路中正确传递

**依赖**: Task 2

---

### Task 4: 编写单元测试

**优先级**: 中
**预估时间**: 1.5 小时

**描述**: 为新增的 channels 解析和映射逻辑编写单元测试。

**测试场景**:
1. 服务器返回完整 `channels` 对象（包含 beta、stable 等）
2. 服务器未返回 `channels` 对象（默认所有版本为 beta）
3. 服务器返回空的 `channels` 对象
4. 版本存在于多个渠道中（边界情况）
5. 版本不存在于任何渠道的 `versions` 数组中（channel 为 undefined）
6. 服务器返回格式错误的 JSON（容错处理）

**测试数据参考**: `/home/newbe36524/repos/newbe36524/pcode/artifacts/azure-index.json`

**验收标准**:
- [ ] 所有测试场景覆盖
- [ ] 测试通过率 100%
- [ ] 测试文件已创建或更新

**依赖**: Task 2

---

### Task 5: 手动集成测试

**优先级**: 高
**预估时间**: 1 小时

**描述**: 在实际环境中验证 channels 功能的正确性。

**步骤**:
1. 启动 Desktop 客户端
2. 打开开发者工具查看 Network 请求
3. 验证从 `server.dl.hagicode.com/index.json` 获取的数据
4. 检查版本列表中每个版本的 channel 信息
5. 测试安装不同渠道的版本
6. 验证渠道信息在 UI 中正确传递

**验收标准**:
- [ ] 客户端成功获取包含 channels 的版本列表
- [ ] 控制台无 channels 相关错误
- [ ] 版本安装/切换功能正常
- [ ] 每个版本的 channel 信息正确显示

**依赖**: Task 3

---

## 第二阶段：UI 支持（可选）

### Task 6: 扩展包源配置结构

**优先级**: 中
**预估时间**: 45 分钟

**描述**: 在包源配置中添加 `defaultChannel` 字段支持。

**步骤**:
1. 打开 `src/main/package-source-config-manager.ts`
2. 在 `StoredPackageSourceConfig` 接口中添加 `defaultChannel?: string`
3. 更新配置验证逻辑（如存在）
4. 设置默认值为 `'beta'`

**验收标准**:
- [ ] 配置接口包含 `defaultChannel` 字段
- [ ] 默认值正确设置
- [ ] 现有配置加载无错误

**依赖**: Task 5

---

### Task 7: 添加渠道选择 IPC 处理器

**优先级**: 中
**预估时间**: 30 分钟

**描述**: 在主进程添加处理渠道切换的 IPC 处理器。

**步骤**:
1. 打开 `src/main/index.ts`（或 IPC 处理文件）
2. 添加 `version:setChannel` IPC 处理器
3. 实现保存用户选择的渠道到配置
4. 返回操作结果

**验收标准**:
- [ ] IPC 处理器正确响应
- [ ] 渠道选择被持久化
- [ ] 错误处理完善

**依赖**: Task 6

---

### Task 8: 更新 Redux 状态管理

**优先级**: 中
**预估时间**: 1 小时

**描述**: 在 Redux store 中添加渠道选择状态管理。

**步骤**:
1. 打开 `src/renderer/store/slices/packageSourceSlice.ts`
2. 添加 `selectedChannel` 状态
3. 添加 `setChannel` action
4. 创建对应的 thunk 异步 action 调用 IPC

**验收标准**:
- [ ] Redux 状态包含 `selectedChannel`
- [ ] Action 和 Thunk 正确实现
- [ ] 类型定义完整

**依赖**: Task 7

---

### Task 9: 实现渠道选择器 UI 组件

**优先级**: 中
**预估时间**: 1.5 小时

**描述**: 创建渠道选择器组件并集成到版本管理页面。

**步骤**:
1. 创建 `src/renderer/components/ChannelSelector.tsx`
2. 实现下拉选择器（stable/beta/alpha）
3. 集成到 `VersionManagementPage.tsx`
4. 连接 Redux 状态和 actions

**验收标准**:
- [ ] 渠道选择器显示在版本管理页面
- [ ] 选择渠道后状态正确更新
- [ ] UI 样式与现有设计一致

**依赖**: Task 8

---

### Task 10: 在版本列表中显示渠道标签

**优先级**: 低
**预估时间**: 1 小时

**描述**: 在版本列表项中添加渠道标识标签。

**步骤**:
1. 修改版本列表项组件
2. 根据版本 channel 显示对应标签
3. 使用不同颜色区分渠道（stable=绿色、beta=蓝色、alpha=橙色）
4. 添加标签的 Tooltip 说明

**验收标准**:
- [ ] 每个版本项显示渠道标签
- [ ] 颜色区分明显
- [ ] Tooltip 提供清晰的说明

**依赖**: Task 9

---

## 文档任务

### Task 11: 更新 API 文档

**优先级**: 低
**预估时间**: 30 分钟

**描述**: 更新相关接口和类型定义的文档注释。

**步骤**:
1. 为新增的 `ChannelInfo` 接口添加 JSDoc 注释
2. 为 `channels` 字段添加 JSDoc 注释
3. 为 `channel` 字段添加 JSDoc 注释
4. 更新使用示例

**验收标准**:
- [ ] 所有新增字段有文档注释
- [ ] 文档清晰说明字段用途

**依赖**: Task 1

---

## 任务依赖图

```
Task 1 (数据模型)
    │
    ▼
Task 2 (HttpIndexSource channels 解析)
    │
    ▼
Task 3 (版本列表传递)
    │
    ├─────────────┐
    ▼             ▼
Task 4 (单元测试)  Task 5 (集成测试)
                    │
                    ▼
            ┌──────Task 6 (配置扩展) ────┐
            ▼                            ▼
    Task 7 (IPC 处理器)           Task 11 (文档)
            │
            ▼
    Task 8 (Redux 状态)
            │
            ▼
    Task 9 (渠道选择器 UI)
            │
            ▼
    Task 10 (版本列表标签)
```

## 总预估时间

- **第一阶段（必需）**: 约 4.5 小时
- **第二阶段（UI 支持）**: 约 5 小时
- **总计**: 约 9.5 小时
