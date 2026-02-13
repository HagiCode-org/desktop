## 1. 类型定义更新

- [ ] 1.1 更新 `manifest-reader.ts` 中的 `Manifest` 接口，新增 `entryPoint` 字段
- [ ] 1.2 新增 `EntryPoint` 接口定义（install, check, start 脚本路径）
- [ ] 1.3 移除 `Dependency` 接口中的 `installCommand` 和 `checkCommand` 字段
- [ ] 1.4 更新 `ParsedDependency` 接口，移除相关字段，确保与新格式兼容
- [ ] 1.5 更新 `parseDependencies` 方法，解析新的 `type` 和 `version.runtime` 结构
- [ ] 1.6 新增 `ResultSessionFile` 接口定义（exitCode, stdout, stderr, duration, timestamp, success, version, errorMessage）
- [ ] 1.7 新增 `ParsedResult` 接口定义（success, version, errorMessage, rawOutput）
- [ ] 1.8 新增 `InstallResult` 接口定义（success, resultSession, parsedResult, installHint）
- [ ] 1.9 新增 `StartResult` 接口定义（success, resultSession, parsedResult, url, port）

## 2. Result Session 文件解析实现

- [ ] 2.1 实现 `readResultFile` 方法，从 `{workingDirectory}/result.json` 读取文件
- [ ] 2.2 实现 `parseResultSession` 方法，解析 result.json 文件内容
- [ ] 2.3 实现错误处理：result.json 文件不存在时的回退逻辑
- [ ] 2.4 格式化原始输出用于 UI 展示

## 3. EntryPoint 解析实现

- [ ] 3.1 在 `ManifestReader` 中新增 `parseEntryPoint(manifest: Manifest)` 方法
- [ ] 3.2 实现 `getScriptPath` 方法，根据平台自动选择脚本扩展名（.sh/.bat/.ps1）
- [ ] 3.3 新增 `resolveScriptPath` 方法，将相对路径转换为绝对路径

## 4. 依赖管理器重构

- [ ] 4.1 在 `DependencyManager` 中新增 `executeEntryPointScript` 私有方法，执行脚本后等待 result.json 生成
- [ ] 4.2 重构 `checkSingleDependency` 方法，使用 `entryPoint.check` 脚本执行检查
- [ ] 4.3 重构 `installSingleDependency` 方法，使用 `entryPoint.install` 脚本执行安装
- [ ] 4.4 更新 `checkFromManifest` 方法，传递 entryPoint 信息
- [ ] 4.5 在安装失败时显示 `installHint` 作为手动安装指引
- [ ] 4.6 集成 `readResultFile` 和 `parseResultSession`，返回包含解析结果的对象
- [ ] 4.7 确保检查和安装结果包含完整的 result.json 信息供 UI 展示

## 5. Onboarding 管理器适配

- [ ] 5.1 更新 `onboarding-manager.ts` 中的 `installDependencies` 方法适配新接口
- [ ] 5.2 更新 `checkDependenciesStatus` 方法适配新的依赖检查流程
- [ ] 5.3 确保 `installHint` 在 onboarding 流程中正确显示
- [ ] 5.4 确保执行结果（result.json 解析内容）正确传递给 UI 层展示

## 6. Web Service Manager 适配

- [ ] 6.1 修改 `web-service-manager.ts` 中的 `start` 方法返回值类型（从无返回值改为 `Promise<StartResult>`）
- [ ] 6.2 更新 `start` 方法实现，使用 `entryPoint.start` 脚本
- [ ] 6.3 在启动脚本执行后，读取并解析 `result.json` 文件
- [ ] 6.4 从 result.json 提取服务 URL 和端口信息
- [ ] 6.5 处理启动失败情况，展示错误信息和日志
- [ ] 6.6 确保启动结果包含完整的 result.json 信息供 UI 展示
- [ ] 6.7 同步更新所有调用 `start()` 方法的代码，适配新的返回值类型

## 7. 清理旧代码

- [ ] 7.1 移除 `parseInstallCommand` 方法中对旧格式的处理逻辑
- [ ] 7.2 移除 `ParsedInstallCommand` 接口（如不再需要）
- [ ] 7.3 清理相关的 region/platform 命令选择逻辑（已迁移到脚本中）

## 8. 测试验证

- [ ] 8.1 验证 `system-runtime` 类型依赖的检查和安装
- [ ] 8.2 验证 `npm` 类型依赖的检查和安装
- [ ] 8.3 验证 `system-requirement` 类型依赖的跳过逻辑
- [ ] 8.4 验证跨平台脚本执行（Windows/macOS/Linux）
- [ ] 8.5 验证 `installHint` 在安装失败时正确显示
- [ ] 8.6 验证 onboarding 流程端到端运行正常
- [ ] 8.7 验证 result.json 文件正确读取和解析（版本号、错误信息）
- [ ] 8.8 验证 result.json 文件不存在时的错误处理
- [ ] 8.9 验证执行日志在 UI 中正确展示
- [ ] 8.10 验证 `entryPoint.start` 服务启动流程正常
- [ ] 8.11 验证启动成功后从 result.json 正确获取 URL 和端口
- [ ] 8.12 验证所有调用 `start()` 方法的代码已适配新的返回值类型
