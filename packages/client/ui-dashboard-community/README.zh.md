---
description: "由 Glance 社区组件思路适配而成的五张可选信息卡片。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-dashboard-community

[English](README.md) | 中文

## 概述

向 DSH 信息面板添加 Tibo 重置观察、GitHub 新项目热榜、日历、可设置日期的倒计时以及本地时间进度。这些是参考 [Glance 社区组件](https://github.com/glanceapp/community-widgets/blob/main/GALLERY.md)与 Glance 内置日历转写的 DSH 原生卡片。DSH 不能直接执行 Glance YAML 和 Go 模板；新增 YAML 组件需要在这里适配数据源、解码和卡片。

## 目录

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用

启用[信息面板组合包](../../bundle/dashboard/README.zh.md)的 `ui-dashboard-community` 行。可在该行设置 `githubDays`（1–30，默认 7）、`githubCount`（1–20，默认 8）和 `requestTimeoutMs`（1000–60000，默认 12000）。倒计时的日期在卡片内修改，只保存在当前浏览器。

适配其他 Gallery 组件时，提供其 YAML 和所需 API 信息。`custom-api` 转成固定来源的 Host 接口和带类型的浏览器卡片；纯日期模板转成本地日期函数。`extension` 通常还需要独立服务，不能只复制 YAML。新卡片注册进 `dashboard.card`，无需改信息面板页面。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节</summary>

[Host 数据源](src/feed.ts)通过受认证的 Connection 路由读取固定的 Tibo 和 GitHub 来源。[Tibo 公开 API](https://tibo.cc/guide/api)提供可能为空的第三方预测；数据或观察过期时不显示概率。GitHub 卡片用 [GitHub Search](https://docs.github.com/en/rest/search/search#search-repositories)查询近期新建项目，并按当前 Star 总数排序。Gallery 的 [Trending GitHub Repositories](https://github.com/glanceapp/community-widgets/blob/main/widgets/trending-github-repositories/README.md)依赖的 OSS Insights 热榜接口目前报告数据不可用，因此改用上述明确的 Search 排序；它不等同于 GitHub 自身的 Trending 列表。日历以周一开头；倒计时与时间进度参考 Gallery 的 [Countdown](https://github.com/glanceapp/community-widgets/blob/main/widgets/countdown/README.md)及 [Time Bar](https://github.com/glanceapp/community-widgets/blob/main/widgets/time-bar/README.md)。进度按本地期间实际起止时间计算，包含闰年。

打开面板时，Tibo 和 GitHub 分别通过同源认证接口刷新。刷新失败保留浏览器内存中的上次成功结果和更新时间，显示具体原因，重新打开会重试。Tibo 概率为空表示上游没有提供数值，成功读取的说明仍然显示；日历、倒计时和时间进度不需要外部请求。

[本地日历](src/client/calendar.ts)使用 [lunar-typescript](https://github.com/6tail/lunar-typescript)计算农历、闰月、节日、节气与传统黄历。选择日期可查看干支、生肖、值神吉凶和宜忌。中国大陆放假与调休上班按库中的年度数据覆盖普通星期规则；2026 年安排已对照[官方通知](https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm)。未收录官方安排的年份明确提示，并只按星期区分工作日和周末。月份导航覆盖 1901–2099 年，按浏览器本地时区显示；黄历吉凶属于传统民俗内容。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [信息面板页面](../ui-dashboard/README.zh.md)——卡片 slot 的拥有者。
- [信息面板组合包](../../bundle/dashboard/README.zh.md)——启用本包。
- [Glance Gallery](https://github.com/glanceapp/community-widgets/blob/main/GALLERY.md)——后续适配的组件示例。

-----

<a id="model-experience"></a>
## 模型体验

无；五张卡片只在浏览器显示，不增加模型输入。

#### KV Cache 影响

无；本包不组装模型请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- Tibo 是第三方社区来源。`reset_chance_percent` 可以为空；卡片不会根据观察等级或历史间隔推断数值。
- GitHub Search 有公开 API 速率限制。刷新失败时卡片保留上次可用结果并显示错误。
- 社区 YAML 需要逐个适配数据和界面；本包不解释任意 Glance Go 模板，也不运行 Gallery 扩展服务。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护上下文</summary>

不发布独立运行时 invariant；各卡片直接观察自己拥有的数据源和本地日期状态。

</details>
