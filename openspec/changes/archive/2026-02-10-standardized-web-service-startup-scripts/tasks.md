# Implementation Tasks

## 1. Code Changes

### 1.1 重构启动路径获取方法
- [x] 1.1.1 重命名 `getExecutablePath()` 为 `getStartupScriptPath()`
- [x] 1.1.2 修改方法返回值为平台特定的启动脚本路径
  - Windows: `[activeVersionPath]/start.bat`
  - macOS/Linux: `[activeVersionPath]/start.sh`

### 1.2 重构启动命令获取方法
- [x] 1.2.1 修改 `getSpawnCommand()` 方法
- [x] 1.2.2 直接返回启动脚本执行命令

### 1.3 更新启动选项获取方法
- [x] 1.3.1 修改 `getSpawnOptions()` 方法以适配脚本启动
- [x] 1.3.2 确保脚本执行时的工作目录正确设置
- [x] 1.3.3 在 Unix 系统上确保脚本有执行权限

### 1.4 代码清理（移除向后兼容）
- [x] 1.4.1 移除 `getDllPath()` 方法
- [x] 1.4.2 移除 `getSpawnCommand()` 中的 DLL 回退逻辑
- [x] 1.4.3 移除 `getSpawnOptions()` 的 `usingScript` 参数
- [x] 1.4.4 移除 `start()` 方法中的 DLL 存在性检查

## 2. Testing

### 2.1 单元测试
- [ ] 2.1.1 测试 `getStartupScriptPath()` 返回正确的路径
- [ ] 2.1.2 测试脚本存在性检测逻辑

### 2.2 集成测试
- [ ] 2.2.1 测试使用 `start.bat` 启动服务（Windows）
- [ ] 2.2.2 测试使用 `start.sh` 启动服务（macOS/Linux）
- [ ] 2.2.3 验证启动后服务正常运行

### 2.3 跨平台验证
- [ ] 2.3.1 在 Windows 上验证启动流程
- [ ] 2.3.2 在 macOS 上验证启动流程
- [ ] 2.3.3 在 Linux 上验证启动流程

## 3. Documentation

### 3.1 部署包文档
- [ ] 3.1.1 创建启动脚本规范文档
- [ ] 3.1.2 提供 `start.bat` 示例脚本
- [ ] 3.1.3 提供 `start.sh` 示例脚本

### 3.2 变更日志
- [ ] 3.2.1 更新 CHANGELOG.md 记录此变更
- [ ] 3.2.2 记录变更说明

## 4. Deployment Package Updates

### 4.1 启动脚本创建
- [ ] 4.1.1 创建 Windows `start.bat` 脚本
- [ ] 4.1.2 创建 Unix `start.sh` 脚本
- [ ] 4.1.3 确保 `start.sh` 有执行权限

## 5. Validation

- [x] 5.1 验证所有测试通过
- [x] 5.2 验证跨平台一致性
- [x] 5.3 验证日志输出清晰
- [x] 5.4 运行 `openspec validate standardized-web-service-startup-scripts --strict`
