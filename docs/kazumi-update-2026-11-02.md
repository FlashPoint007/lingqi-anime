# Kazumi 最新更新与网站跟进（2026-11-02）

本站基线 v122，原生源码 `60de85e52c7ee49c93ec99d4dd2453dbfd208810`。本轮读取上游最近 40 个提交、最近 5 个正式发布及相关完整差异；最新正式版仍为 [2.4.2](https://github.com/Predidit/Kazumi/releases/tag/2.4.2)（2026-10-23），main 核对到 [`1f79f2d1`](https://github.com/Predidit/Kazumi/commit/1f79f2d11f338fdbbb190e64fb64b4a97af38c47)。下列 10 月 31 日改动已合并到 main，不能称为新正式版本。

| 最近上游变化 | 本站处理 |
| --- | --- |
| [下载完成时保存离线弹幕，避免排队时目录尚未就绪](https://github.com/Predidit/Kazumi/commit/16735534ba65bd2fb665f565dde2bd8f696532aa) | 现有网页实现已在完成媒体写入后捕获弹幕，未发现同样的提前超时问题。本轮补充实际下载流程回归：排队记录模拟等待一小时，暂停后继续，视频完成后仍保存正确集数的弹幕；HLS/MP4 已完成分片复用回归保持通过。没有重复添加功能或改变下载数据格式。 |
| [追番分类切换避免重建整个库与反复生成字体](https://github.com/Predidit/Kazumi/commit/4d04b470bed58e989ba87c79e630af4946800c43)、[选中分类同步修正](https://github.com/Predidit/Kazumi/commit/5f9b3137775c8ba1565e11b994b53e03a22ae8c7) | 原网页每次切换分类都会重新规范化所有标题/别名并排序，计数还要重复遍历。现在分类/布局切换复用匹配和排序结果，计数按库变化单次遍历。直接状态选择原本就正确；没有搬入 Flutter 的滑动动画/字体补丁。测试验证切换分类、布局不会重复执行完整查询，而关键词及片单更新会正确重算。 |
| [投屏过滤不可播放设备并发送番剧、集数信息](https://github.com/Predidit/Kazumi/commit/60288c33553fc2ffd331821345a027b2873cb770) | 适配 Google Cast 的标题、集数和封面元信息；使用实际媒体类型，修复签名/无扩展名 HLS 被当成 MP4。选择设备或接收器加载期间切集，旧请求不再继续操作新视频；浏览器独有的 blob、离线库地址在选择设备前拒绝。网页没有原生 DLNA 发现能力，设备过滤交给 Cast SDK，不宣称支持原生 DLNA。 |
| [退出时清理 Windows 托盘](https://github.com/Predidit/Kazumi/commit/87543b51fa0341299a235c47cf5c0c4bfef29818)、Flutter / dlna_dart 升级 | 属于原生应用，不移植安装包、系统托盘或 Flutter 依赖。 |

## 规则仓库同步

读取 KazumiRules [`2967d7ba`](https://github.com/Predidit/KazumiRules/commit/2967d7babafffa92dbf35fbcb69d0fd964139e63) 的有效索引和全部 18 个文件，逐一核对名称与版本后更新本机备用快照。补入 TvTFun 1.3（API 搜索 / XPath 分集，使用实际链接排除未开放剧集），更新 AGE 1.6 与 mutefun 1.6。mutefun 已换域名并由 API 搜索改为 XPath，继续使用旧备用规则会请求已废弃的接口。

线上 D1 的自动同步仍按完整上游索引进行，无需用户登录；本次改善冷启动与上游暂不可达时的备用数据，不以本机快照覆盖比它更新的线上规则。mutefun 的上游新规则含验证码要求，本轮不绕过源站验证，也不承诺这 18 个源当前都可播放。

## 验证边界

新增 `check-kazumi-oct31.cjs`，六个场景先在基线实现失败，修复后通过。投屏测试执行实际适配器，使用 Cast SDK 替身验证元信息、真实类型、切集竞争及本地文件拒绝；云浏览器不能替代电视/Chromecast 实机验收。

既有离线下载回归增加“长时间排队 → 暂停 → 继续 → 完成 → 保存对应弹幕”的检查，同时验证捕获发生前视频记录与资产均已完成。完整检查包括 57 项 CJS 回归、TypeScript、`check-web.mjs` 与正式构建。18 条规则均通过格式和解析模式验证，第三方线上可用性另行抽查。
