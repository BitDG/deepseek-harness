# Agent Note: Session 创建接受初始权限与模型选择

Status: implemented

[English](2026-09-03-session-create-initial-permission-and-model.md) | 中文

## 问题

为外部对话创建 Session 的 Remote 消费方，需要在首条 prompt 前选择该 Session 的权限 preset 和模型。创建后再调用现有变更 endpoint 会产生顺序空档，而 `session.selectModel` 还会把选择保存为 Host 全局默认值。复用显式 Session id 还会带来第二个风险：create-or-adopt 请求可能悄然修改已经存在的 Session。

## 决策

仅当 Host 生成 Session id 时，`SessionCreateRequest` 才接受可选的 `permissionPreset` 和 `modelSelection`。控制器会在创建 Agent 前验证两个选择，然后在返回前记录权限 preset，并安装 Session 本地模型选择。因此首条 prompt 会观察到二者，同时 Host 已保存的默认模型保持不变。

把任一初始选择与 `sessionId` 一起提交的请求会以 `gateway/bad-request` 失败。不可用的权限 preset 会以 `session/permission-preset-unavailable` 失败，不可用模型继续使用现有的 `session/model-unavailable` 结果。验证会在 `ensureSession` 前完成，因此被拒绝的选择不会创建 Session。

## 验证

Session Controller Host 测试覆盖使用生成 id 成功创建、记录权限与模型选择、拒绝不可用 preset，以及在显式 id 采用时拒绝初始选择。包类型检查和生成的 Cordis API 输出覆盖公开 Remote 声明。

## 曾考虑的替代方案

**创建后立即调用现有变更 endpoint。** 这会留下 prompt 可能以 Host 默认值开始的竞态，而且 `session.selectModel` 会有意持久化新的 Host 全局默认值。

**在显式 id 采用期间允许初始选择。** 调用方无法证明指定的 Session 是新的。拒绝这种组合可以让采用继续作为不变更状态的身份检查。

**添加 IM 专用 Host 钩子。** Session 初始化属于 Session Controller Remote API；特定传输层钩子会复制生命周期顺序，并阻止其他 Remote 消费方复用同一保证。

## 后果

Remote 集成可以用确定的权限和模型选择创建 Session，且不会改变全局默认值。已有 Session 保持不变，包括消费方以显式 id 重试创建时。API 增加两个可选请求字段和一个权限专用失败码；由于现有权限与模型事件已记录这些选择，因此没有持久格式或 Session 事件类型变化。
