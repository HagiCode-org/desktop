## 1. Implementation

### 1.1 增强 Manifest Reader 能力
- [ ] 1.1.1 在 `Manifest` 接口中添加 `packageMetadata` 字段定义
- [ ] 1.1.2 在 `Manifest` 接口中添加 `npmConfig` 字段定义（镜像配置）
- [ ] 1.1.3 在 `Manifest` 接口中添加 `donationInfo` 字段定义
- [ ] 1.1.4 实现 `readPackageMetadata()` 方法
- [ ] 1.1.5 实现 `readNpmConfig()` 方法
- [ ] 1.1.6 实现 `readDonationInfo()` 方法
- [ ] 1.1.7 添加 Manifest 字段缺失的 fallback 逻辑

### 1.2 移除 Dependency Manager 中的硬编码
- [ ] 1.2.1 删除 `NPM_PACKAGES` 常量定义
- [ ] 1.2.2 删除 `NpmPackage` 接口定义（如不再需要）
- [ ] 1.2.3 重构 `checkNpmPackage()` 方法以接收包元数据参数
- [ ] 1.2.4 重构 `installNpmPackage()` 方法以接收包元数据参数
- [ ] 1.2.5 更新 `checkFromManifest()` 方法以使用完整的 Manifest 数据
- [ ] 1.2.6 更新 `installFromManifest()` 方法以使用完整的 Manifest 数据
- [ ] 1.2.7 移除 `DependencyType` 枚举中硬编码的包类型映射

### 1.3 重构 NPM Mirror Helper
- [ ] 1.3.1 添加从 Manifest 读取镜像配置的方法
- [ ] 1.3.2 更新 `detectRegion()` 以支持 Manifest 中的区域配置
- [ ] 1.3.3 更新 `getNpmInstallArgs()` 以使用 Manifest 配置
- [ ] 1.3.4 添加 fallback 到硬编码默认值的逻辑
- [ ] 1.3.5 更新构造函数以接收可选的 Manifest 配置

### 1.4 更新 Web Service Manager
- [ ] 1.4.1 检查并移除硬编码的包名匹配逻辑
- [ ] 1.4.2 确保 `getVersion()` 方法完全依赖 Manifest
- [ ] 1.4.3 移除任何硬编码的包标识符

### 1.5 更新渲染进程 Saga
- [ ] 1.5.1 更新 `dependencySaga.ts` 以传递 Manifest 元数据
- [ ] 1.5.2 更新依赖安装 action 以包含完整的包信息
- [ ] 1.5.3 更新依赖检查 action 以使用 Manifest 数据

### 1.6 更新 Redux Slice
- [ ] 1.6.1 更新 `dependencySlice.ts` 状态结构
- [ ] 1.6.2 添加 Manifest 元数据字段
- [ ] 1.6.3 更新相关 reducer

### 1.7 更新 UI 组件
- [ ] 1.7.1 更新 `DependencyManagementCardUnified.tsx` 使用 Manifest 数据
- [ ] 1.7.2 移除组件中的硬编码包信息
- [ ] 1.7.3 添加 Manifest 读取错误处理

### 1.8 测试
- [ ] 1.8.1 测试依赖项检查功能
- [ ] 1.8.2 测试依赖项安装功能
- [ ] 1.8.3 测试 NPM 镜像配置
- [ ] 1.8.4 测试 Manifest 缺失的 fallback 行为
- [ ] 1.8.5 测试版本管理流程
- [ ] 1.8.6 测试 onboarding 流程中的依赖安装

## 2. Validation

### 2.1 Manifest 结构验证
- [ ] 2.1.1 验证现有 Manifest 文件包含所有必需字段
- [ ] 2.1.2 为缺失字段的 Manifest 创建迁移脚本
- [ ] 2.1.3 验证 Manifest schema 与代码接口一致

### 2.2 回归测试
- [ ] 2.2.1 运行完整的依赖管理测试套件
- [ ] 2.2.2 测试版本安装和更新流程
- [ ] 2.2.3 测试 onboarding 流程
- [ ] 2.2.4 验证 CI/CD 构建成功

## 3. Documentation

### 3.1 更新规范文档
- [ ] 3.1.1 创建 `specs/dependency-management/spec.md` delta
- [ ] 3.1.2 创建 `specs/npm-mirror-config/spec.md` delta
- [ ] 3.1.3 创建 `specs/package-management/spec.md` delta

### 3.2 更新项目文档
- [ ] 3.2.1 更新 `openspec/project.md` 中的相关描述
- [ ] 3.2.2 记录 Manifest schema 扩展
- [ ] 3.2.3 添加迁移指南（如有需要）
