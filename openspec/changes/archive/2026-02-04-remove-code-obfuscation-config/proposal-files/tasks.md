# 实施任务清单

**变更 ID**: `remove-code-obfuscation-config`
**创建时间**: 2025-02-04
**预计工时**: 1-2 小时

---

## 任务概览

本文档列出了移除代码混淆配置所需的所有实施任务。任务按照逻辑顺序排列,应该依次完成。

---

## 阶段 1: 依赖和配置清理

### - [ ] 1.1 移除 javascript-obfuscator 依赖

**文件**: `package.json`

**操作**:
1. 打开 `package.json`
2. 在 `devDependencies` 中找到 `"javascript-obfuscator": "^5.1.0"`
3. 删除该依赖行
4. 保存文件

**验证**:
```bash
npm install
npm list javascript-obfuscator  # 应该显示为空或 UNMET DEPENDENCY
```

**预期结果**: 依赖成功从 package.json 移除,node_modules 中不再包含该包

---

### - [ ] 1.2 移除混淆相关的 npm scripts

**文件**: `package.json` 的 `scripts` 部分

**需要移除的命令**:
- `obfuscate`: `node scripts/obfuscate.js`
- `obfuscate:dry`: `node scripts/obfuscate.js --dry-run`
- `obfuscate:verbose`: `node scripts/obfuscate.js --verbose`

**需要修改的命令**:
- `build:prod`: 从 `npm run build:all && npm run obfuscate && npm run smoke-test` 改为 `npm run build:all && npm run smoke-test`

**操作**:
1. 打开 `package.json`
2. 在 `scripts` 部分删除上述三个命令
3. 更新 `build:prod` 命令
4. 保存文件

**验证**:
```bash
npm run obfuscate  # 应该报错 "Missing script"
npm run build:prod  # 应该成功执行
```

**预期结果**: 混淆相关的 script 命令被移除,build:prod 不再依赖混淆步骤

---

## 阶段 2: 脚本文件处理

### - [ ] 2.1 删除 obfuscate.js 脚本

**文件**: `scripts/obfuscate.js`

**操作**:
1. 使用 `rm scripts/obfuscate.js` 或通过文件管理器删除
2. 确认文件已删除

**验证**:
```bash
ls scripts/obfuscate.js  # 应该显示 "No such file or directory"
git status  # 应该显示文件已删除
```

**预期结果**: 混淆脚本文件完全删除

---

### - [ ] 2.2 更新 ci-build.js 脚本

**文件**: `scripts/ci-build.js`

**需要移除的内容**:
1. `config.skipObfuscate` 选项
2. `--skip-obfuscate` 命令行参数解析
3. 混淆相关的日志输出
4. 混淆检查逻辑

**具体修改**:

1. 移除配置项 (第 52 行):
```javascript
// 删除
skipObfuscate: false,
```

2. 移除命令行参数处理 (第 144-145 行):
```javascript
// 删除
case '--skip-obfuscate':
  config.skipObfuscate = true;
  break;
```

3. 移除 help 信息中的选项 (第 124 行):
```javascript
// 删除这一行
--skip-obfuscate              Skip obfuscation step
```

4. 移除构建参数中的混淆选项 (第 354-356 行):
```javascript
// 删除
if (config.skipObfuscate) {
  buildArgs.push('--skip-obfuscate');
}
```

5. 更新构建摘要中的日志 (第 281 行):
```javascript
// 修改前
log(`  Obfuscation: ${config.skipObfuscate ? 'Skipped' : 'Enabled'}`, colors.green);

// 修改后
// 完全删除这一行
```

**验证**:
```bash
node scripts/ci-build.js --help  # 检查帮助信息不包含 --skip-obfuscate
```

**预期结果**: ci-build.js 不再包含任何混淆相关逻辑

---

### - [ ] 2.3 更新 smoke-test.js 脚本

**文件**: `scripts/smoke-test.js`

**需要移除的内容**:
- "code shows obfuscation indicators" 测试用例 (第 168-197 行)

**操作**:
1. 打开 `scripts/smoke-test.js`
2. 找到 `test('code shows obfuscation indicators', () => {` 函数
3. 删除整个测试函数 (从第 168 行到第 197 行)
4. 保存文件

**具体删除内容**:
```javascript
/**
 * Test: Check for common obfuscation indicators (production builds only)
 */
test('code shows obfuscation indicators', () => {
  const mainJs = path.join(process.cwd(), 'dist', 'main', 'main.js');

  if (!fs.existsSync(mainJs)) {
    log('  ⊘ Skipping: main.js does not exist', colors.yellow);
    results.skipped++;
    return;
  }

  const content = fs.readFileSync(mainJs, 'utf8');

  // Check for common obfuscation patterns
  const hasHexNames = /0x[0-9a-f]+/i.test(content);
  const hasStringArray = /stringArray|_0x[a-f0-9]+/i.test(content);
  const isCompacted = !content.includes('\n\n') && content.split('\n').length < content.length / 100;

  logVerbose(`has hex identifier names: ${hasHexNames}`);
  logVerbose(`has string array patterns: ${hasStringArray}`);
  logVerbose(`is compacted: ${isCompacted}`);

  // At least one obfuscation indicator should be present in production
  const isObfuscated = hasHexNames || hasStringArray || isCompacted;

  if (!isObfuscated) {
    log('  ℹ Code is not obfuscated (development build)', colors.gray);
    results.skipped++;
  } else {
    assert(true, 'code shows obfuscation indicators');
  }
});
```

**验证**:
```bash
npm run smoke-test
```

**预期结果**: smoke-test 成功执行,不再检查混淆特征

---

## 阶段 3: 清理和验证

### - [ ] 3.1 检查并删除 obfuscator.config.js (如果存在)

**文件**: `obfuscator.config.js` (可能在根目录)

**操作**:
1. 检查文件是否存在: `ls obfuscator.config.js`
2. 如果存在,删除该文件

**验证**:
```bash
ls obfuscator.config.js  # 应该显示 "No such file or directory"
```

**预期结果**: 混淆配置文件删除(如果存在)

---

### - [ ] 3.2 清理 node_modules 和依赖

**操作**:
1. 删除 node_modules: `rm -rf node_modules`
2. 删除 package-lock.json: `rm package-lock.json`
3. 重新安装依赖: `npm install`

**验证**:
```bash
npm list | grep obfuscat  # 应该没有输出
npm list javascript-obfuscator  # 应该显示为空
```

**预期结果**: 依赖完全清理,没有残留的混淆相关包

---

### - [ ] 3.3 执行完整的构建验证

**操作**:
1. 清理 dist 目录: `rm -rf dist`
2. 执行完整构建: `npm run build:all`
3. 运行 smoke test: `npm run smoke-test`

**验证**:
```bash
npm run build:all
npm run smoke-test
```

**预期结果**:
- ✓ 所有 TypeScript 编译成功
- ✓ Vite 构建成功
- ✓ 所有 smoke test 通过
- ✓ dist/ 目录生成正确的文件

---

### - [ ] 3.4 验证应用启动和基本功能

**操作**:
1. 启动应用: `npm start` 或 `npm run dev`
2. 检查应用窗口是否正常显示
3. 验证核心功能:
   - 主进程启动正常
   - 渲染进程加载正常
   - 系统托盘集成正常
   - 基本交互正常

**验证**:
```bash
npm start
# 检查应用是否正常启动,查看控制台是否有错误
```

**预期结果**:
- ✓ 应用正常启动
- ✓ 控制台无错误日志
- ✓ UI 正常显示
- ✓ 基本功能可操作

---

### - [ ] 3.5 检查生成的代码是否清晰可读

**操作**:
1. 打开 `dist/main/main.js`
2. 检查代码是否可读
3. 确认没有混淆痕迹:
   - 变量名是否清晰
   - 是否没有 hex 标识符 (0x1234)
   - 是否没有 string array 混淆模式

**验证**:
```bash
head -n 50 dist/main/main.js  # 查看前 50 行
grep -i "0x[0-9a-f]" dist/main/main.js | head -n 5  # 检查 hex 模式
```

**预期结果**:
- ✓ 代码可读性良好
- ✓ 无混淆特征
- ✓ 变量命名规范

---

### - [ ] 3.6 执行特定平台构建测试 (可选)

**操作**:
根据当前平台执行相应的构建命令:

- **Windows**: `npm run build:win`
- **macOS**: `npm run build:mac`
- **Linux**: `npm run build:linux`

**验证**:
```bash
# 根据平台执行对应的构建命令
# 检查 pkg/ 目录是否生成了正确的安装包
```

**预期结果**:
- ✓ 平台特定构建成功
- ✓ 安装包正确生成
- ✓ 打包的应用可以正常安装和运行

---

## 阶段 4: 文档和清理

### - [ ] 4.1 更新项目文档 (如果需要)

**文件**: `openspec/project.md`, `README.md` (如果存在)

**操作**:
1. 检查 `openspec/project.md` 中是否提及代码混淆
2. 如果有提及,更新相关描述
3. 检查是否有其他文档提到混淆配置

**具体更新**:
- `openspec/project.md` 第 47 行: 移除 "javascript-obfuscator 5.1.0: 代码混淆工具"
- 检查构建相关的文档说明

**验证**:
```bash
grep -n "obfuscat" openspec/project.md  # 应该没有结果或仅在历史变更中提及
```

**预期结果**: 项目文档准确反映当前配置,不再提及代码混淆

---

### - [ ] 4.2 清理 Git 暂存区并提交变更

**操作**:
1. 检查所有变更: `git status`
2. 查看变更详情: `git diff`
3. 暂存所有变更: `git add .`
4. 提交变更:
```bash
git commit -m "Remove code obfuscation configuration

- Remove javascript-obfuscator dependency from package.json
- Remove obfuscate.js script
- Update ci-build.js to remove obfuscation options
- Update smoke-test.js to remove obfuscation detection
- Clean up npm scripts related to obfuscation
- Update build:prod to skip obfuscation step

This change aligns the project with AGPL-3.0 license requirements
by ensuring code transparency for the open source community.

Related: #[issue-number]"
```

**验证**:
```bash
git log -1 --stat  # 查看提交统计
git status  # 应该显示工作区干净
```

**预期结果**: 所有变更已提交,Git 工作区干净

---

## 完成检查清单

在标记任务完成后,确保以下所有检查项都通过:

- [x] 所有依赖已移除 (`npm list | grep obfuscat` 无输出)
- [x] 所有脚本文件已更新或删除
- [x] 构建成功执行 (`npm run build:all`)
- [x] 测试通过 (`npm run smoke-test`)
- [x] 应用正常启动和运行
- [x] 生成的代码清晰可读,无混淆痕迹
- [x] 文档已更新
- [x] Git 变更已提交

---

## 回滚计划

如果在实施过程中遇到问题,可以按以下步骤回滚:

1. **Git 回滚**:
```bash
git reset --hard HEAD~1  # 回滚最后一次提交
git checkout .  # 恢复所有文件
npm install  # 恢复依赖
```

2. **手动恢复**:
- 从 Git 历史中恢复 `scripts/obfuscate.js`
- 恢复 `package.json` 中的依赖和 scripts
- 恢复 `scripts/ci-build.js` 和 `scripts/smoke-test.js`

---

## 备注

- 本变更不涉及应用源代码的修改
- 仅影响构建和打包流程
- 不影响应用的运行时行为
- 符合 AGPL-3.0 开源许可证要求
