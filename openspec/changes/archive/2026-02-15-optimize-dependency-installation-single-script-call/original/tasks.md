# 实施任务清单

## 概述

本文档列出了将 OnboardingManager 中的依赖安装逻辑从循环调用优化为单次批量调用的实施步骤。

**变更 ID**: `optimize-dependency-installation-single-script-call`
**预计复杂度**: 简单
**预计工作量**: 1-2 小时

---

## 阶段 1：分析与验证

### 任务 1.1：验证现有批量安装实现
**优先级**: 高
**预估时间**: 15 分钟
**负责人**: 开发者

**描述**: 验证 `DependencyManager.installFromManifest` 方法已正确实现批量安装功能

**验收标准**:
- [ ] 确认 `installFromManifest` 方法执行单次脚本调用
- [ ] 确认方法正确读取和解析 `install-result.json`
- [ ] 确认进度回调机制工作正常

**相关文件**:
- `src/main/dependency-manager.ts:768-929`

---

### 任务 1.2：定位需要修改的代码
**优先级**: 高
**预估时间**: 10 分钟
**负责人**: 开发者

**描述**: 确认 OnboardingManager 中需要修改的具体代码位置

**验收标准**:
- [ ] 定位 `installDependencies` 方法中的循环调用代码
- [ ] 确认当前的进度报告机制
- [ ] 确认错误处理逻辑

**相关文件**:
- `src/main/onboarding-manager.ts:305-370`

---

## 阶段 2：实施

### 任务 2.1：重构 OnboardingManager.installDependencies
**优先级**: 高
**预估时间**: 30 分钟
**负责人**: 开发者

**描述**: 修改 `installDependencies` 方法，使用 `installFromManifest` 替代循环调用

**实施步骤**:

1. **移除循环调用逻辑**
   ```typescript
   // 删除以下代码
   for (const dep of dependenciesToInstall) {
     const installResult = await this.dependencyManager.installSingleDependency(dep, entryPoint);
     // ...
   }
   ```

2. **添加批量安装调用**
   ```typescript
   // 调用 installFromManifest 进行批量安装
   const installResult = await this.dependencyManager.installFromManifest(
     manifest,
     dependenciesToInstall,
     (progress) => {
       // 处理进度更新
       const itemIndex = dependencyItems.findIndex(item => item.name === progress.dependency);
       if (itemIndex >= 0) {
         dependencyItems[itemIndex].status = progress.status === 'success' ? 'installed' :
                                              progress.status === 'error' ? 'error' : 'installing';
         dependencyItems[itemIndex].progress = progress.status === 'installing' ? 50 : 100;
         if (onProgress) {
           onProgress([...dependencyItems]);
         }
       }
     }
   );
   ```

3. **处理安装结果**
   ```typescript
   if (installResult.failed.length > 0) {
     // 更新失败的依赖项状态
     for (const failed of installResult.failed) {
       const itemIndex = dependencyItems.findIndex(item => item.name === failed.dependency);
       if (itemIndex >= 0) {
         dependencyItems[itemIndex].status = 'error';
         dependencyItems[itemIndex].error = failed.error;
       }
     }
   }
   ```

**验收标准**:
- [ ] 代码编译成功
- [ ] 不再存在循环调用 `installSingleDependency` 的代码
- [ ] 进度报告逻辑正确适配批量调用
- [ ] 错误处理逻辑正确处理批量结果

**相关文件**:
- `src/main/onboarding-manager.ts:305-370`

---

### 任务 2.2：更新进度报告逻辑
**优先级**: 中
**预估时间**: 20 分钟
**负责人**: 开发者

**描述**: 调整进度报告逻辑以适配单次批量调用的进度回调格式

**实施细节**:

`installFromManifest` 的进度回调格式：
```typescript
{
  current: number,
  total: number,
  dependency: string,
  status: 'installing' | 'success' | 'error'
}
```

**验收标准**:
- [ ] 进度回调正确映射到 UI 状态
- [ ] "installing" 状态正确显示
- [ ] "success" 和 "error" 状态正确更新

**相关文件**:
- `src/main/onboarding-manager.ts:305-370`

---

### 任务 2.3：优化错误处理
**优先级**: 中
**预估时间**: 15 分钟
**负责人**: 开发者

**描述**: 调整错误处理逻辑以处理批量安装的结果格式

**实施细节**:

批量安装返回格式：
```typescript
{
  success: string[],
  failed: Array<{ dependency: string; error: string }>
}
```

**验收标准**:
- [ ] 失败的依赖项正确显示错误信息
- [ ] 成功的依赖项正确标记为已安装
- [ ] 部分失败场景正确处理

**相关文件**:
- `src/main/onboarding-manager.ts:305-370`

---

## 阶段 3：测试

### 任务 3.1：单元测试
**优先级**: 中
**预估时间**: 20 分钟
**负责人**: 开发者

**描述**: 验证修改后的代码逻辑正确性

**测试场景**:
1. **成功场景**: 5 个依赖项全部安装成功
2. **部分失败场景**: 3 个成功，2 个失败
3. **全部失败场景**: 所有依赖项安装失败
4. **空依赖场景**: 没有需要安装的依赖项

**验收标准**:
- [ ] 所有测试场景通过
- [ ] 进度报告在所有场景下正确工作
- [ ] 错误信息在失败场景下正确显示

---

### 任务 3.2：集成测试
**优先级**: 高
**预估时间**: 30 分钟
**负责人**: 开发者 + QA

**描述**: 在真实环境中验证批量安装功能

**测试步骤**:
1. 启动应用程序
2. 触发 Onboarding 流程
3. 在依赖安装步骤，验证只有一次脚本调用
4. 验证所有依赖项正确安装
5. 验证进度报告正常工作

**验证方法**:
- 查看日志确认只有一次脚本执行
- 观察 UI 进度报告
- 验证最终安装状态

**验收标准**:
- [ ] 日志显示只有一次 Install 脚本调用
- [ ] UI 正确显示安装进度
- [ ] 所有依赖项安装状态正确

**相关文件**:
- `src/main/onboarding-manager.ts`
- `src/main/dependency-manager.ts`

---

### 任务 3.3：回归测试
**优先级**: 中
**预估时间**: 20 分钟
**负责人**: QA

**描述**: 验证其他依赖安装场景未受影响

**测试场景**:
1. **VersionManagementPage**: 版本管理页面的批量安装功能
2. **单个依赖安装**: 独立的单个依赖安装功能
3. **依赖检查**: 依赖状态检查功能

**验收标准**:
- [ ] 版本管理页面批量安装正常工作
- [ ] 单个依赖安装功能正常
- [ ] 依赖检查功能正常

---

## 阶段 4：文档与清理

### 任务 4.1：代码注释更新
**优先级**: 低
**预估时间**: 10 分钟
**负责人**: 开发者

**描述**: 更新代码注释以反映批量安装的实现

**验收标准**:
- [ ] `installDependencies` 方法注释更新
- [ ] 关键逻辑添加说明注释

---

### 任务 4.2：更新提案文档
**优先级**: 低
**预估时间**: 5 分钟
**负责人**: 开发者

**描述**: 标记提案为已实施状态

**验收标准**:
- [ ] proposal.md 状态更新为"已实施"
- [ ] 记录任何实施过程中的发现或偏差

---

## 验收总结

### 最终验收标准

- [ ] **功能完整性**: Onboarding 流程中依赖安装正常工作
- [ ] **性能优化**: 多依赖项安装只触发一次脚本调用
- [ ] **用户体验**: 进度报告清晰，错误信息准确
- [ ] **回归测试**: 其他依赖安装场景未受影响
- [ ] **代码质量**: 代码清晰，注释完整

### 完成定义

当所有高优先级任务完成，且最终验收标准全部满足时，本变更被视为完成。

---

## 附录

### 修改摘要

| 组件 | 修改类型 | 影响范围 |
|------|----------|----------|
| OnboardingManager.installDependencies | 重构 | Onboarding 流程 |

### 风险评估

- **技术风险**: 低 - 使用已验证的 `installFromManifest` 方法
- **回归风险**: 低 - 仅影响 Onboarding 流程
- **性能风险**: 无 - 预期性能提升

### 时间估算

- **乐观估算**: 1 小时
- **预期估算**: 1.5 小时
- **悲观估算**: 2.5 小时
