# 致谢与数据/API 来源

本项目为原创 Node.js 插件，源码采用 GPL-3.0-or-later。以下列出实际使用的数据源、调用协议和研究依据；列入致谢不表示接口提供方为第三方插件提供官方支持或背书。核验日期与证据见 [API 审计](API-AUDIT.md)。

## 官方内容与社区

感谢 [杭州游卡网络技术有限公司 / 三国杀移动版](https://www.sanguosha.cn/) 提供移动版官方资讯、活动公告、武将/技能资料、公开皮肤图、攻略及模式介绍。插件原创解析 `/pc/news-list-*`、`news-detail-*`、`hero-list`、`hero-detail-*`、`guide-list-*`、`guide-info-*`、`mode-info-*` 公开网页，提供原文来源。官网将池和概率图片仍以原文为准，公开皮肤图不代表玩家拥有。

感谢官方「[三国咸话](https://xh.sanguosha.cn/web/2)」、[旧版社区](https://xianhua.sanguosha.cn/) 和 [APP 介绍](https://hi.sanguosha.cn/pc/index.html)。用户所称“三国闲话”对应官方名称“三国咸话”。本项目仅接三国杀移动版，不引用 OL、十周年、欢乐三国杀或其他版本个人资料接口。

## 实际接入的 API 与授权协议

| 来源主机 | 接入端点 | 用途与状态 |
| --- | --- | --- |
| [share.sanguosha.cn](https://share.sanguosha.cn/skins/) | `GET /api/skins/list?type=1\|2\|3&page=N&limit=100` | 官方皮肤绘影堂公开展示目录；按至尊、传说、原画分类读取并校验分页，无需社区授权，不发送社区会话 |
| [wxforum.sanguosha.cn](https://wxforum.sanguosha.cn/api/topics?page=1&category_id=0&include=user,label&has_label=0&just_video=0) | `/api/topics`、`/api/searchV2/topics`、`/api/rank/today`、`theme`、`week`、`all` | 已实测匿名读取帖子、攻略搜索、帖子/话题热度及社区人气榜；过滤无关用户/IP/地址字段 |
| [hi-gateway.sanguosha.cn](https://hi.sanguosha.cn/pc/index.html) | `/api/login/v1/qrcode`：POST 生成、GET 查询 | 真实用户已完成三国咸话 APP 扫码，官方本人验证成功，社区会话 AES 保存 |
| [wxforum.sanguosha.cn](https://xianhua.sanguosha.cn/) | `/api/profile`、`/api/user/getGameSummary`、`getGameForce`、`getGameRecord`、`getGameRecordList`、`/api/general/getMyLike` | APP 会话的本人社区资料、概览、将力、战绩统计/最近对局、社区收藏线上均成功返回；字段业务含义待与 APP 逐项核对 |
| [hi-gateway.sanguosha.cn](https://hi.sanguosha.cn/pc/index.html) | `/api/game/v2/general/gameInfo`、`property`、`generalSkins`、`abilities`、`bestGeneral` | APP 会话的本人游戏资料、资产、皮肤、能力、擅长武将线上均成功返回；字段业务含义待与 APP 逐项核对 |
| [api-xh.sanguosha.cn](https://xh.sanguosha.cn/web/2) | `/sgxh/pcScan/generateId`、`/sgxh/pcScan/poll` | 新版社区微信扫码生成/轮询，已实测待扫码状态 |
| [xh.sanguosha.cn](https://xh.sanguosha.cn/web/2) | `/web/api/auth/login`、`/web/api/auth/logout` | 新版微信扫码票据交换网页会话及注销协议；微信方式的真实交换待单独授权验收 |
| [api-xh.sanguosha.cn](https://xh.sanguosha.cn/web/2) | `/user/userInfo`、`/user/gameSummary`、`/user/getAllOtherGameUser` | 新版微信会话的本人资料、游戏概览、其他游戏角色映射协议；未与旧版令牌混用，待微信方式单独授权验收 |

受保护接口名称来自官方前端；匿名请求已确认若干接口需要认证。APP 扫码与 11 类本人接口连通性已完成真实用户验收，微信方式仍按其单独证据记录；详情见 [脱敏验收](VERIFICATION.md)。社区登录不等于官号或华为游戏渠道登录，这两类游戏登录仍未接通。`general/getMyLike` 是社区收藏，不代表本人拥有武将；本次空收藏响应不代表没有武将。没有接入手机验证码/密码登录，没有调用未核实的游戏角色绑定或华为 OAuth 端点。

协议研究依据为官方公开的 [旧社区公共 API 定义](https://xianhua.sanguosha.cn/_nuxt/baseApi.8d2df587.js)、[公开列表](https://xianhua.sanguosha.cn/_nuxt/home.f8ac2989.js)、[武将/攻略定义](https://xianhua.sanguosha.cn/_nuxt/generalApi.059ef62f.js)、[个人资料定义](https://xianhua.sanguosha.cn/_nuxt/recordApi.2943a9d0.js)、[登录定义](https://xianhua.sanguosha.cn/_nuxt/login.0bde981d.js)、[APP 扫码界面](https://xianhua.sanguosha.cn/_nuxt/default.fd6ebdba.js)，以及 [新版社区授权资源](https://cf-resources.sanguosha.cn/web/c2d4aC13ZWI/_next/static/chunks/400-e9aa5397ef7c35d9.js)。构建文件名会随官网更新变化；插件原创调用协议，没有复制官方 APP/网站实现源码，也不发布含用户元数据的原始研究文件。

## 登录研究与软件依赖

- [移动版第三方 SDK 清单](https://www.sanguosha.cn/sgs_agreement/SDK_info.html) 与 [华为 Account Kit](https://developer.huawei.com/consumer/cn/sdk/account-kit)：仅作为华为渠道能力研究依据，当前没有连接华为游戏账户 API。华为 OpenID 与应用有关，独立授权不能自动读取三国杀移动版角色；依据 [华为接入说明](https://developer.huawei.com/consumer/cn/doc/quickapp-guides/quickapp-access-account-kit-0000001079648144) 与 [令牌交换接口说明](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/account-api-obtain-user-token)。
- [node-qrcode / soldair](https://github.com/soldair/node-qrcode)，MIT：在本机编码官方二维码内容，不将扫码凭据发送到第三方绘码网站。其他随包依赖的许可证保留在各自 npm 包内。
- [AI-Plugin](https://github.com/719083594/AI-Plugin) 的共享原生渲染服务，以及 [sharp](https://sharp.pixelplumbing.com/)，Apache-2.0，和 [libvips](https://www.libvips.org/) 图像后端，LGPL-2.1-or-later：固定版本本地 SVG 转 JPEG，用于资产、战绩、胜率及其他标准动态卡片内存绘图。平台预编译包及各组件许可证保留在 npm 依赖中，不调用在线绘图 API。
- [Node.js](https://nodejs.org/)，MIT 及其第三方组件许可证：使用原生 ESM、Fetch、加密、文件与测试接口。
- [TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai)：Bot 命令适配目标；核心查询也可独立使用。橙汁的 `orangejuice.plugin.json` 是实例配置声明，未向插件复制橙汁实现代码。

游戏、社区的内容、名称、图片和标识属于对应权利人，社区投稿属于其作者。转载请遵守原站条款与作者要求；插件保留原文链接。公开来源和登录协议可能变化，接口失败时明确返回限制，不伪造个人数据或认证成功。

图片界面的官方道具、武将图和静态装饰来自 `imagexh.sanguosha.com` 与移动版官网，逐项原地址、哈希、大小及原创替代图类别保存在 [素材清单](ASSETS.md) 与 `resources/ui/assets/manifest.json`。近期战绩中官方返回的武将头像仅从 `sjpubicres.sanguosha.cn/release/character_heads/` 固定目录匿名只读取得并保留在本次内存，不传社区凭据。帮助、资料卡排版、内存图片处理及五张明确标记的原创 SVG 属于本项目；官方图片权利仍归游卡及各原权利人，未宣称获得开放素材许可。

本人收藏由已授权的 `hi-gateway.sanguosha.cn/api/game/v2/general/generalSkins` 与 `gameInfo` 提供部分条目和独立拥有统计，不将预览误作全部拥有。本次皮肤配图来自响应中的 `sjpubicres.sanguosha.cn/release/character_skins/skins/` 官方公开资源，严格限定路径、匿名读取、只保留本次内存，不发送会话凭据。收藏数量对照、范围提示、私聊权限和分页图片视图由本项目原创实现。

公开皮肤图鉴的栅格原图来自官方皮肤绘影堂所声明的 `sjwx-oss.sanguosha.cn/skins/image/`。本插件离线制作缩略图，并在 `resources/skin-gallery/manifest.json` 保留每个官方条目 ID、名称、原图地址和缩略图哈希。头像网格、皮肤网格、势力筛选及 Bot 分页属于本项目原创实现；官方目录和图鉴范围见 [图鉴说明](CATALOG.md)。
