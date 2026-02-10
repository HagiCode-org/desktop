## 1. Implementation

- [ ] 1.1 创建 `.github/workflows/pr-checks.yml` 工作流文件
- [ ] 1.2 配置工作流触发条件（PR 创建或更新时执行）
- [ ] 1.3 添加依赖安装步骤（`npm ci`）
- [ ] 1.4 添加 TypeScript 类型检查步骤（`npm run build:tsc:check`）
- [ ] 1.5 添加生产构建步骤（`npm run build:prod`）
- [ ] 1.6 添加冒烟测试步骤（`npm run smoke-test`）
- [ ] 1.7 配置检查失败时的错误输出格式
- [ ] 1.8 配置 Node.js 版本（使用与 build.yml 相同的版本）

## 2. Testing

- [ ] 2.1 创建测试 PR 验证工作流触发
- [ ] 2.2 验证依赖安装失败时检查正确失败
- [ ] 2.3 验证类型错误时检查正确失败
- [ ] 2.4 验证构建失败时检查正确失败
- [ ] 2.5 验证测试失败时检查正确失败
- [ ] 2.6 验证所有检查通过时工作流成功

## 3. Documentation

- [ ] 3.1 更新 openspec/specs/ci-cd/spec.md 添加 PR 检查要求
- [ ] 3.2 在项目 README 中说明 PR 检查要求（如有）
- [ ] 3.3 配置 GitHub 仓库设置，将检查设置为必需（需由仓库管理员操作）

## 4. Validation

- [ ] 4.1 运行 `openspec validate pr-automation-checks-workflow --strict` 验证提案格式
- [ ] 4.2 确认所有任务已完成
- [ ] 4.3 测试 PR 检查工作流在生产环境中的表现
