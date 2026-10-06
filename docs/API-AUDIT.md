# 三国杀移动版接口审计

核验日期：2026-10-07（Asia/Shanghai）。本记录包含早期公开网页/前端协议、匿名只读检查，以及后续真实用户三国咸话 APP 扫码和本人接口验收。未收集密码或验证码，未下载 APK。插件原创实现，没有复制官方 APP/网站源代码。授权会话仅由实例 AES 保存，公开审计不包含账号、凭据、二维码内容或原始个人响应。

**当前结论：APP 实扫成功，线上 11 类本人接口均成功返回；官网资讯、刘备详情及 today 热榜成功。字段业务含义尚未与 APP 一一核对；官号游戏登录和华为渠道游戏登录仍未接通。** 脱敏结果见 [VERIFICATION.md](VERIFICATION.md)。以下匿名检查记录用于说明未授权时的接口边界，不代表当前本人授权仍未完成。

## 产品身份与社区功能

- 用户指定的 <https://www.sanguosha.cn/> 页面明确标记“三国杀移动版”，发行方为杭州游卡网络技术有限公司。这是本插件唯一支持的游戏版本，不使用 OL、十周年、欢乐三国杀或台湾版接口。
- 官网“官方论坛/三国咸话”入口指向 <https://xh.sanguosha.cn/web/2>。用户所称“三国闲话 APP”对应官方名称“三国咸话”。旧社区 <https://xianhua.sanguosha.cn/> 仍可访问。
- 官方 APP 介绍 <https://hi.sanguosha.cn/pc/index.html> 宣传资讯、攻略、福利、找杀友；战绩系统列明最新战绩、将力指数、胜率分析、擅长武将、拥有皮肤、排位段位。说明这些数据在官方产品存在，但不构成向第三方插件开放的授权证明。

## 已实测可匿名读取的资料

| 来源 | 请求 | 结果与用途 |
| --- | --- | --- |
| 移动版官网 | GET `/pc/news-list-1004.html?page=1` | HTTP 200，公告 ID、标题、分类、日期、原文链接。分类 1001 活动、1006 排位、1007 斗地主、1008 身份国战、1009 资讯由官方分类链接证实。 |
| 移动版官网 | GET `/pc/news-detail-2393.html` | HTTP 200，2026 年 10 月斗地主将池公告。正文部分将池仅为图片；插件提供图片和原文，不伪造 OCR/名单。 |
| 移动版官网 | GET `/pc/hero-list.html`、`/pc/hero-detail-1.html` | HTTP 200，武将 ID/版本名、势力、历史简介、特点、关键卡牌、分模式技能、玩法、公开皮肤图。官网页面并非个人拥有列表。 |
| 移动版官网 | GET `/pc/guide-list-3001.html` | HTTP 200，攻略 ID、分类、标题、日期；详情路径是 `guide-info-{id}.html`。3001 新手、3002 初阶、3003 进阶、3004 趣闻由官方导航证实。 |
| 移动版官网 | GET `/pc/mode-info-1.html` | HTTP 200，人数/时长/玩法/快速攻略。官方模式 ID：身份1、排位2、3v3=3、国战4、斗地主5、幻化7、太虚8。 |
| 官方旧社区 API | GET `https://wxforum.sanguosha.cn/api/topics?page=1&category_id=0&include=user,label&has_label=0&just_video=0` | HTTP 200，业务 code 0，公开帖子列表。 |
| 官方旧社区 API | GET `.../rank/today`、`.../rank/theme`、`.../rank/week`、`.../rank/all` | 四项全部 HTTP 200、code 0、各50条：今日帖子/热门话题/一周红人/著名大佬。 |
| 官方旧社区 API | GET `.../searchV2/topics?keyword=赵云&category_id=6&is_theme=0&page=1&from=general` | HTTP 200、code 0，6条公开武将攻略。 |

匿名社区 GET 使用官方前端可见头部：`content-type: application/json`、`platform: pc`、`AppVersion-Code: 1.0.0`，不传 Authorization。协议来源：<https://xianhua.sanguosha.cn/_nuxt/home.f8ac2989.js>、<https://xianhua.sanguosha.cn/_nuxt/generalApi.059ef62f.js>、<https://xianhua.sanguosha.cn/_nuxt/baseApi.8d2df587.js>。构建资源文件名随官网更新可变化；它们是本次核验来源，插件运行时只访问上述资料页面/接口。

社区 API 的原始帖子对象存在 `share_pic`（有时为 IP）、`address`、完整用户对象等无关字段；插件只输出 ID、标题、正文摘要、日期、分类、公开作者昵称、互动计数、图片和原文链接，不保存/输出这些元数据。原始审计 HTML/JS 临时文件不应发布到 GitHub。

## 个人数据接口与登录边界

早期在官方前端发现以下真实受保护协议，并进行了无凭据请求。后续 APP 本人授权成功后的状态另列在验收记录，不能用匿名认证失败推断合法授权也无法读取：

| 接口 | 匿名实测 |
| --- | --- |
| `https://wxforum.sanguosha.cn/api/user/getGameSummary` | HTTP 401，认证失败 |
| `https://wxforum.sanguosha.cn/api/general/getNew`、`general/getHot` | HTTP 401，认证失败 |
| `https://wxforum.sanguosha.cn/api/user/getGeneralInfo?general_id=1` | HTTP 401，认证失败 |
| `https://hi-gateway.sanguosha.cn/api/game/v2/general/gameInfo` | HTTP 200、业务 code 401，“授权失败” |
| `https://api-xh.sanguosha.cn/user/gameSummary?gameId=2` | HTTP 401、业务 code1003，未登录或 token 过期 |

旧前端还声明 `user/getGameForce`、`user/getGameRecord?model={0..4}`、`user/getGameRecordList`、`game/v2/general/property`、`generalSkins`、`abilities`、`bestGeneral` 等个人接口。证据：<https://xianhua.sanguosha.cn/_nuxt/recordApi.2943a9d0.js>。这些已在后续真实 APP 会话中成功返回；但尚未与 APP 逐字段核对，不能据接口名称或结构计数宣称完整拥有武将/皮肤、余额、段位、历史战绩或胜率已全部正确解读。

同日追加官方显示字段核验：PC 战绩页 `record.70e69d2f.js`、H5 战绩页 `record.5e722f27.js` 和资产页 `obtain.cb450439.js` 的 API 变量与中文标签绑定已用于原创格式器，覆盖 summary、force、records、recent、assets、gameInfo 的已证实字段。源码链接、逐项映射、胜率公式及未解释项见 [PERSONAL-FIELDS.md](PERSONAL-FIELDS.md)。这次只读取公开前端，不请求真实账号接口；中文标签核验不等于真实 APP 数据完整验收。本人命令追加 `导出` 可取得完整已脱敏 JSON，未知字段不因摘要而丢弃。

### 社区授权与官号游戏登录

新版官网社区前端公开的授权流程是微信扫码：向 `https://api-xh.sanguosha.cn/sgxh/pcScan/generateId` POST `{gameId:2}`；扫码页是 `https://xh.sanguosha.cn/web/scan/weixin?scanId=...`；`/sgxh/pcScan/poll` 返回 `appletToken` 后，官网自己的 `/web/api/auth/login` 接收 `{ticket:...}`；官网客户端从 `WEB_SESSIONID` cookie 获得 Authorization。证据：<https://cf-resources.sanguosha.cn/web/c2d4aC13ZWI/_next/static/chunks/400-e9aa5397ef7c35d9.js>。

旧社区声明 `app/sendLoginPhoneCode`、`app/phoneLogin` 和社区 QR 授权，证据 <https://xianhua.sanguosha.cn/_nuxt/login.0bde981d.js>。插件只接社区扫码，没有接手机验证码/密码登录。默认 APP 扫码已由真实用户完成并取得通过本人资料验证的社区会话；这不证明官号游戏授权或游戏角色渠道归属。官号游戏登录仍未接通，身份登记明确为未认证，不猜游戏密码登录接口。

同日只读复核移动版官方公开资料：[隐私政策](https://www.sanguosha.cn/sgs_agreement/index.html)介绍了产品自身的手机号登录、第三方账号辅助登录及跨端扫码。本次查阅未找到供独立插件登记的官号游戏授权流程、服务端票据校验、渠道角色映射和个人游戏数据权限协议。官网描述支持这些登录方式，不等于已提供可供本插件接入的游戏授权 API；现有社区会话也不能据此标记官号游戏登录成功。

### 华为渠道

移动版官网[第三方合作伙伴及共享信息说明](https://www.sanguosha.cn/sgs_agreement/SDK_info.html)明确列出“华为 Game Service SDK”，证明官方产品使用华为游戏服务。华为[游戏服务介绍](https://developer.huawei.com/consumer/cn/hms/huawei-game)列有游戏登录功能。本次查看的官方公开资料中，仍未找到供独立插件接入的三国杀移动版华为游戏授权、渠道角色映射或完整个人数据协议。

须区分两类标识：华为 [Account Kit 接入文档](https://developer.huawei.com/consumer/cn/doc/quickapp-guides/quickapp-access-account-kit-0000001079648144)中的 OpenID 与应用相关，同一账号在不同应用得到不同 OpenID；华为[快游戏账号 FAQ](https://developer.huawei.com/consumer/es/doc/quickApp-Guides/quickgame-faq-account-0000002453354825)则说明游戏登录使用 Game Service 返回的 playerId，与 Account Kit 的 OpenID 是不同概念。不能把“OpenID 与应用相关”扩展成所有 Game Service 玩家标识均采用相同规则，也不能把任一华为标识直接当成移动版的渠道、区服或角色 ID。快游戏文档在这里仅用于解释标识差别，不用于推定本移动版采用的具体协议版本。

华为[用户级凭证交换文档](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/account-api-obtain-user-token)要求使用 AGC 为应用分配的 `client_id/client_secret`，且 `client_id` 必须与取得授权码时的应用一致。华为 [Android 游戏登录接入示例](https://developer.huawei.com/consumer/en/codelab/HMSGameKit/index.html?cardName=HMSGameKit&lang=en)要求创建自己的游戏应用、配置签名证书指纹、开启 Account Kit/Game Service，并通过 SDK 登录和获取玩家信息。这说明存在官方接入能力，但不证明本插件拥有三国杀移动版对应的应用权限或游卡服务端映射。为本插件登记独立华为 OAuth，只能按该应用获准的权限授权，不能自动换成移动版游戏会话或读取渠道角色资产。本次未使用游戏官方应用身份，未尝试绕过认证。

华为支持状态同为 unsupported，官方操作入口为华为应用市场/游戏中心；本插件将 `official` 与 `huawei` 的身份键分开，身份登记不写 `authenticated:true`。上述“未找到”仅是本次官方公开资料复核的结果，不宣称接口永久不存在。

### 接入游戏渠道仍需的材料

以下是继续开发和验证所需的工程材料，不代表官方已承诺提供这些接口：

1. 游卡确认独立插件可接入的范围，并提供适用的客户端登记方式及正式授权协议。具体可以是官方支持的扫码、授权码或其他授权方式，不能由插件猜测。
2. 官号与华为分别提供可校验的授权票据、签发方与目标应用说明，以及移动版渠道、区服、角色归属映射协议；华为侧还需确认本插件适用的应用资质、配置和获准权限。独立应用的华为登录成功不能替代游卡游戏侧校验。
3. 本人资料、拥有武将、皮肤、资产、战绩等接口的权限范围、字段定义、分页与完整性规则，以及凭证有效期、刷新和撤销规则。

这些材料到位后才能判断并实施相应路线。当前实际缺口是游戏授权协议和服务端角色/数据映射未确认，并非只缺一个登录按钮或用户密码；本插件不会索取密码补齐该缺口。

## 当前可交付范围与真正缺口

公开资料插件技术可行：官网公告/将池/概率原文、武将详情/技能/皮肤图、官方攻略/模式、社区资讯/攻略搜索、热榜和公开作者排行均有真实来源。信息聚合、检索、订阅、新公告去重、缓存、来源标记、导出可以独立实现。

现已取得真实用户授权的社区会话并成功读取 11 类本人接口。用户希望的“绝大多数个人信息”和“官号、华为游戏登录”仍不能整体宣称完成：字段业务含义与 APP 覆盖范围尚待逐项核对，游戏渠道授权与角色映射未证实，完整拥有武将列表和完整游戏排行榜也未验证。后续须继续使用本人合法授权，区分社区访问与两个游戏渠道，不发布敏感数据。

## 原创插件模块

`SanguoshaMobile-Plugin/lib/public.mjs` 仅做公开只读查询；所有列表统一 `{items, sourceUrl,...}`，单件带 `sourceUrl`。`lib/login.mjs` 实现登录能力状态和渠道隔离身份登记；不收集密码、验证码、Cookie、Token，不伪造成功。自动化测试覆盖移动版来源、武将变体、嵌套正文、响应隐私字段、受保护接口、URL跳转边界和渠道隔离；另有真实公开接口烟测。

致谢应列杭州游卡网络技术有限公司/三国杀移动版官网、三国咸话公开社区 API；华为文档只作为登录能力研究依据，当前没有调用华为 API。请不要把未调用的接口列为已连接 API。

## 授权能力补全（同日追加）

继续查验官方旧社区的登录弹窗 <https://xianhua.sanguosha.cn/_nuxt/default.fd6ebdba.js>，其文案明确为“打开三国咸话APP扫一扫登录”；`POST https://hi-gateway.sanguosha.cn/api/login/v1/qrcode` 传 JSON `null`，返回 `{code:0,data:{qrcode:...}}`；`GET` 同端点传 `qrcode` 查询参数，未扫码返回 `{code:0,data:{token:""}}`。官方前端直接保存扫码后的 `data.token` 作为 Authorization，再查询 wxforum `/profile`。这是真实社区授权，不是游戏密码登录，也没有已证实的华为渠道标识。

早期新版扫码匿名检查：`generateId` 返回 code1000、非空 scanId、`expireIn:300`；待扫码 `poll` 返回 code1000、`status:"pending"`、空 appletToken。新版微信方式目前仍只完成生成/待扫码检查，票据交换及其本人查询需要单独授权验收。默认旧版 APP 方式后来已由真实用户扫码成功。旧版弹窗轮询为每2秒、60轮，插件采用120秒轮询窗口并注明这是前端窗口而非服务器返回的精确有效期。官方 UI 将返回的 `data.qrcode` 直接编码成二维码，不额外添加 URI 前缀；当前 APP 实扫成功也验证了此处理方式。

新增原创模块 `lib/community-auth.mjs`：优先支持 `app-qr-v1`（三国咸话APP），也支持 `pc-scan-v7`（微信扫码，需官方网页交换WEB_SESSIONID）。`start` 返回待扫码请求；`poll` 取得凭证后必须再通过官方本人资料端点验证，才返回社区授权 session。待扫码、过期、失败都不会标记成功。模块不保存或打印会话；Bot核心负责用AES加密保存、只允许本人私聊查询。

默认 APP 会话已在线成功调用 11 类本人查询：profile、summary、force、records（0全部/1排位/2身份/3国战/4斗地主）、recent（`user/getGameRecordList`，官方前端实参 `{model,page}`）、gameInfo、assets、skins、abilities、bestGeneral、favorites。逐项结构计数见验收记录，字段业务含义尚未与 APP 一一核对。`favorites` 来自 `general/getMyLike`，仅为社区收藏；本次空列表不代表玩家没有武将。新版仅接已核实的 profile、summary、roles（`user/getAllOtherGameUser` 返回角色映射来源），仍待该协议本人授权验收。不混用两套凭证，不猜客户端凭据，不编造绑定接口。官方角色尚未关联时，业务code20020返回需在官方APP关联角色。

私有返回数据递归去掉Token/Cookie/密码/手机号/邮箱/实名/身份证/IP/设备标识等字段，保留本人授权的业务响应。社区授权始终标记 `gameAuthenticated:false`、`channelVerified:false`；官号与华为游戏渠道登录仍为未接通。身份、session 和待扫码内容整体 AES 加密并按 QQ 隔离；旧身份 JSON 经加密回读及路径/旧文件一致性验证后才删除。退出仅清理本人授权并保留登记身份，旧社区远程撤销端点未核实，不宣称注销其他客户端。

初审快照的官网 HTML 解析验证过588个武将、刘备3条分模式技能/8张公开皮肤图、15条公告、9条新手攻略、模式4个详情段和将池附2图；这些是当时页面快照计数，不保证未来官网条目不变。初审 Windows Node 曾直连官网超时，后续部署服务器已成功查询资讯、刘备详情、today 热榜，并完成真实 APP 扫码及 11 类本人接口请求。回归测试另覆盖协议、私聊隔离、凭据隐藏、固定端点、AES完整性、大小限制与跨进程锁；自动化测试与真实接口结果分别记录。

Bot 个人 JSON 通过内存 Buffer 发送，大文件在内存中 gzip；CLI 只向终端输出数据，二维码提示去 Bot 获取，不再自动保存明文 JSON/二维码。该行为与用户自行保存收到的文件不同，插件不能替本人管理外部副本。
