# Implementation Tasks

## 1. 实现平台感知的包版本过滤

- [x] 1.1 在 `PackageManagementCard.tsx` 中创建 `filterVersionsByPlatform` 函数
  - 接收 `versions: string[]` 和 `currentPlatform: string` 参数
  - 实现平台名称匹配逻辑（不区分大小写）
  - 实现 "no runtime" / "no RT" 包排除逻辑
  - 返回过滤后的版本数组

- [x] 1.2 在组件中使用过滤函数
  - 在渲染前调用 `filterVersionsByPlatform(availableVersions, platform)`
  - 将结果存储到 `filteredVersions` 常量
  - 处理 `platform` 为 `null` 的边缘情况（显示所有版本或提示用户）

- [x] 1.3 更新版本下拉列表渲染
  - 修改 `SelectContent` 中的 `.map()` 调用使用 `filteredVersions`
  - 确保空列表时仍显示正确的占位符

- [x] 1.4 更新版本统计显示文本
  - 修改显示文本从 `Available versions: {availableVersions.length} found`
  - 改为 `Available versions: {filteredVersions.length} found (filtered by platform: {platform})`
  - 处理平台检测中的情况

## 2. 实现安装前检测的服务启动控制

- [x] 2.1 在 `WebServiceStatusCard.tsx` 中导入包管理状态选择器
  - 添加 `import { selectPackageManagementInfo } from '../store/slices/webServiceSlice'`
  - 确认选择器已导出（存在于 `webServiceSlice.ts:205-211`）

- [x] 2.2 在组件中获取包安装状态
  - 添加 `useSelector` 调用获取 `selectPackageManagementInfo`
  - 提取 `packageInfo` 对象
  - 添加类型安全检查（可选链 `packageInfo?.isInstalled`）

- [x] 2.3 修改启动按钮显示逻辑（第 173-191 行）
  - 在 `isStopped` 条件内添加 `packageInfo?.isInstalled` 判断
  - 当 `isInstalled === false` 时渲染 `Alert` 组件
  - 当 `isInstalled === true` 时渲染现有的 `Button` 组件

- [x] 2.4 创建未安装状态的提示 UI
  - 使用 `Alert` 和 `AlertDescription` 组件
  - 添加 `Info` 图标
  - 编写清晰的引导文本说明需要先安装包
  - 可选：添加"滚动到包管理区域"的交互

## 3. 边缘情况处理和错误预防

- [x] 3.1 处理平台检测延迟
  - 当 `platform === null` 时显示 "Detecting platform..." 状态
  - 考虑在平台检测期间禁用版本选择或显示所有版本

- [x] 3.2 处理空版本列表
  - 过滤后如果 `filteredVersions.length === 0`，显示特定提示
  - 提示用户可能需要检查包源目录或切换平台

- [x] 3.3 处理包状态同步延迟
  - 考虑安装完成后自动刷新服务状态
  - 确保 `packageInfo` 状态更新及时反映到 UI

## 4. 测试和验证

- [ ] 4.1 手动测试平台过滤功能
  - 在 Linux 环境测试：准备包含 `linux`, `win`, `darwin` 关键字的版本名称
  - 验证仅显示包含 `linux` 的版本
  - 验证排除包含 `no runtime` 或 `no RT` 的版本

- [ ] 4.2 手动测试服务启动控制功能
  - 场景 1：包未安装时，验证显示 Alert 而非启动按钮
  - 场景 2：包已安装时，验证显示启动按钮
  - 场景 3：安装过程中，验证 UI 状态正确更新

- [ ] 4.3 跨平台验证（可选）
  - 在 Windows 环境验证 `win` 关键字过滤
  - 在 macOS 环境验证 `darwin` 关键字过滤
  - 确认平台检测逻辑正确

- [ ] 4.4 用户体验检查
  - 确认提示文本清晰易懂
  - 确认版本计数准确反映过滤结果
  - 确认界面布局在 Alert 显示时保持整洁

## 5. 代码清理和文档（可选）

- [x] 5.1 添加函数注释
  - 为 `filterVersionsByPlatform` 添加 JSDoc 注释
  - 说明过滤逻辑和平台匹配规则

- [x] 5.2 代码审查检查清单
  - 确认无 TypeScript 类型错误
  - 确认无 ESLint 警告
  - 确认组件保持可读性和可维护性

## 验证标准

完成所有任务后，应满足以下标准：

1. ✅ 版本下拉列表仅显示匹配当前平台的版本
2. ✅ 版本列表排除包含 "no runtime" 或 "no RT" 的包
3. ✅ 版本统计显示过滤后的数量和平台信息
4. ✅ 服务未安装时显示引导提示而非启动按钮
5. ✅ 服务已安装时正常显示启动按钮
6. ✅ 所有边缘情况都有合适的 UI 反馈
7. ✅ 无控制台错误或警告
