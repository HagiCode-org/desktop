# Windows BAT 脚本静默执行优化 - 实施任务清单

## 1. 核心功能实现

### 1.1 统一 spawn 选项配置

- [ ] 1.1.1 在 `dependency-manager.ts` 中创建 `getSpawnOptions()` 私有辅助方法
  - [ ] 返回包含 `windowsHide: true` 的 Windows 特定选项
  - [ ] 返回包含 `stdio: ['pipe', 'pipe', 'pipe']` 的 stdio 配置
  - [ ] 保持 Unix 平台的现有行为（chmod、默认选项）
- [ ] 1.1.2 在 `web-service-manager.ts` 中更新或创建 `getSpawnOptions()` 方法
  - [ ] 确保返回选项中包含 `windowsHide: true` (Windows)
  - [ ] 确保与现有 `detached` 和 `stdio` 配置兼容

### 1.2 更新 dependency-manager.ts 中的 spawn 调用

- [ ] 1.2.1 更新 `executeEntryPointScript()` 方法
  - [ ] 使用 `getSpawnOptions()` 替换内联选项配置
  - [ ] 验证 stdout/stderr 捕获逻辑正常工作
  - [ ] 验证 onOutput 回调正常传递输出
- [ ] 1.2.2 更新 `executeCommandWithRealTimeOutput()` 方法
  - [ ] 使用 `getSpawnOptions()` 替换内联选项配置
  - [ ] 确保输出缓冲和回调机制正常工作

### 1.3 更新 web-service-manager.ts 中的 spawn 调用

- [ ] 1.3.1 更新 `getSpawnOptions()` 方法
  - [ ] 添加或验证 `windowsHide: true` 选项 (Windows)
  - [ ] 确保与现有 `detached` 选项配置兼容
  - [ ] 验证 stdio 配置（'ignore' 或 pipe）
- [ ] 1.3.2 更新 `executeStartScript()` 方法
  - [ ] 使用更新后的 `getSpawnOptions()` 方法
  - [ ] 验证进程启动和监控逻辑
- [ ] 1.3.3 更新 `forceKill()` 方法中的 spawn 调用
  - [ ] 确保 taskkill spawn 使用 `windowsHide: true`

## 2. Stdio 流管理

### 2.1 进程输出捕获增强

- [ ] 2.1.1 验证 stdout 数据处理
  - [ ] 确保数据块正确转换为字符串
  - [ ] 验证多行输出处理
  - [ ] 确保输出正确记录到 electron-log
- [ ] 2.1.2 验证 stderr 数据处理
  - [ ] 确保错误输出正确捕获
  - [ ] 验证错误日志格式化
  - [ ] 确保错误正确记录到 electron-log

### 2.2 IPC 通信通道（可选）

- [ ] 2.2.1 设计进程输出 IPC 事件格式
  - [ ] 定义事件名称（如 `process-output`、`process-error`）
  - [ ] 定义事件数据结构（type、data、timestamp）
- [ ] 2.2.2 实现 IPC 发送逻辑
  - [ ] 在 stdout/stderr 处理中添加 IPC 发送
  - [ ] 确保只发送关键信息（避免过载）
  - [ ] 添加错误处理（如无可用窗口）

## 3. 测试验证

### 3.1 Windows 平台测试

- [ ] 3.1.1 视觉验证
  - [ ] 在 Windows 10 上执行依赖安装，确认无控制台窗口弹出
  - [ ] 在 Windows 11 上执行依赖安装，确认无控制台窗口弹出
  - [ ] 验证 Web 服务启动过程无控制台窗口
- [ ] 3.1.2 日志验证
  - [ ] 检查 electron-log 文件包含进程输出
  - [ ] 验证 stdout 和 stderr 正确区分
  - [ ] 确认日志包含时间戳和来源标识
- [ ] 3.1.3 功能验证
  - [ ] 确认依赖安装成功完成
  - [ ] 确认 Web 服务正常启动
  - [ ] 验证进程停止和重启功能
  - [ ] 验证进程超时和错误处理

### 3.2 跨平台兼容性验证

- [ ] 3.2.1 macOS 测试
  - [ ] 在 macOS 上执行依赖安装
  - [ ] 验证 Web 服务启动
  - [ ] 确认现有功能不受影响
- [ ] 3.2.2 Linux 测试
  - [ ] 在 Linux 上执行依赖安装
  - [ ] 验证 Web 服务启动
  - [ ] 确认现有功能不受影响

### 3.3 回归测试

- [ ] 3.3.1 现有功能测试
  - [ ] 验证依赖检查功能
  - [ ] 验证包安装流程
  - [ ] 验证版本管理流程
  - [ ] 验证进程状态监控
- [ ] 3.3.2 错误处理测试
  - [ ] 测试脚本执行失败场景
  - [ ] 测试超时场景
  - [ ] 测试进程意外终止场景
  - [ ] 验证错误消息正确显示

## 4. 代码审查和文档

### 4.1 代码审查准备

- [ ] 4.1.1 代码自审
  - [ ] 确保所有 spawn 调用使用统一选项
  - [ ] 验证错误处理完整
  - [ ] 确认日志级别合理
  - [ ] 检查代码注释充分
- [ ] 4.1.2 性能检查
  - [ ] 验证无额外性能开销
  - [ ] 确认内存使用无异常
  - [ ] 检查无资源泄漏

### 4.2 文档更新

- [ ] 4.2.1 代码注释
  - [ ] 为 `getSpawnOptions()` 添加注释说明平台特定行为
  - [ ] 更新相关方法的 JSDoc 注释
- [ ] 4.2.2 变更日志
  - [ ] 准备变更描述
  - [ ] 记录影响范围
  - [ ] 添加升级说明（如需要）

## 5. 完成检查

- [ ] 5.1 所有 tasks 完成检查
  - [ ] 逐项确认上述任务已完成
  - [ ] 验证所有测试通过
  - [ ] 确认文档更新完整

- [ ] 5.2 成功标准验证
  - [ ] ✅ Windows 上执行 BAT 脚本时不弹出黑色控制台框
  - [ ] ✅ 进程的 stdout 和 stderr 能正确记录到 electron-log
  - [ ] ✅ 应用仍能正常启动、停止和重启子进程
  - [ ] ✅ macOS 和 Linux 平台行为不受影响
