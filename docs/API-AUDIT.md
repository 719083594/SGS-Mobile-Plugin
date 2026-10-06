# 三国杀移动版接口审计

核验日期：2026-10-07（Asia/Shanghai）。仅查看官方公开网页/前端协议和匿名只读接口；未提交密码、验证码或账号凭据，未下载 APK，未改 Bot。插件原创实现，没有复制官方 APP/网站源代码。

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

已在官方前端发现以下真实受保护协议，并进行了无凭据请求：

| 接口 | 匿名实测 |
| --- | --- |
| `https://wxforum.sanguosha.cn/api/user/getGameSummary` | HTTP 401，认证失败 |
| `https://wxforum.sanguosha.cn/api/general/getNew`、`general/getHot` | HTTP 401，认证失败 |
| `https://wxforum.sanguosha.cn/api/user/getGeneralInfo?general_id=1` | HTTP 401，认证失败 |
| `https://hi-gateway.sanguosha.cn/api/game/v2/general/gameInfo` | HTTP 200、业务 code 401，“授权失败” |
| `https://api-xh.sanguosha.cn/user/gameSummary?gameId=2` | HTTP 401、业务 code1003，未登录或 token 过期 |

旧前端还声明 `user/getGameForce`、`user/getGameRecord?model={0..4}`、`user/getGameRecordList`、`game/v2/general/property`、`generalSkins`、`abilities`、`bestGeneral` 等个人接口。证据：<https://xianhua.sanguosha.cn/_nuxt/recordApi.2943a9d0.js>。它们未经本人合法会话实测，不能宣称本插件已能显示拥有武将/皮肤、余额、段位、完整战绩或个人胜率。

### 官号

新版官网社区前端公开的授权流程是微信扫码：向 `https://api-xh.sanguosha.cn/sgxh/pcScan/generateId` POST `{gameId:2}`；扫码页是 `https://xh.sanguosha.cn/web/scan/weixin?scanId=...`；`/sgxh/pcScan/poll` 返回 `appletToken` 后，官网自己的 `/web/api/auth/login` 接收 `{ticket:...}`；官网客户端从 `WEB_SESSIONID` cookie 获得 Authorization。证据：<https://cf-resources.sanguosha.cn/web/c2d4aC13ZWI/_next/static/chunks/400-e9aa5397ef7c35d9.js>。

旧社区有 `app/sendLoginPhoneCode`、`app/phoneLogin` 和社区 QR 授权，证据 <https://xianhua.sanguosha.cn/_nuxt/login.0bde981d.js>。这两个流程是**社区登录**，本次没有提交请求/扫码/验证码，也未核实官号游戏角色绑定流程与客户端授权资格；不能混同为“官号游戏登录”。因此插件给真实官方入口、角色身份登记、明确 unsupported 状态，不猜游戏密码登录接口。

### 华为渠道

移动版官网 <https://www.sanguosha.cn/sgs_agreement/SDK_info.html> 明确列出“华为 Game Service SDK”，证明官方产品使用华为游戏服务。没有在本次查看的官方网页和前端发现向第三方机器人开放的三国杀移动版华为授权、角色映射或个人数据协议。

华为官方 Account Kit 文档 <https://developer.huawei.com/consumer/cn/doc/quickapp-guides/quickapp-access-account-kit-0000001079648144> 指出 OpenID 与应用相关，同一账号在不同应用得到不同 OpenID；<https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/account-api-obtain-user-token> 的授权码交换需要本应用的 client_id/client_secret。因此给本插件接入独立华为 OAuth 不能自动读取三国杀移动版渠道角色资产，也不能使用伪造或借用游戏客户端 ID。

华为支持状态同为 unsupported，官方操作入口为华为应用市场/游戏中心；本插件将 `official` 与 `huawei` 的身份键分开，身份登记不写 `authenticated:true`。未查到是本次审计范围的结果，不宣称这些接口永久不存在。

## 当前可交付范围与真正缺口

公开资料插件技术可行：官网公告/将池/概率原文、武将详情/技能/皮肤图、官方攻略/模式、社区资讯/攻略搜索、热榜和公开作者排行均有真实来源。信息聚合、检索、订阅、新公告去重、缓存、来源标记、导出可以独立实现。

用户希望“绝大多数个人信息都能看”和“官号、华为登录”不能在现有证据下宣称完成。仍缺该游戏可供第三方使用的授权协议/凭据、渠道角色映射、本人会话和对应字段实测。官方游戏或官方三国咸话内的登录可由用户直接完成；后续接入应基于其本人授权的受支持协议/会话，严格区分两个渠道并避免上传敏感数据。

## 原创插件模块

`SanguoshaMobile-Plugin/lib/public.mjs` 仅做公开只读查询；所有列表统一 `{items, sourceUrl,...}`，单件带 `sourceUrl`。`lib/login.mjs` 实现登录能力状态和渠道隔离身份登记；不收集密码、验证码、Cookie、Token，不伪造成功。自动化测试覆盖移动版来源、武将变体、嵌套正文、响应隐私字段、受保护接口、URL跳转边界和渠道隔离；另有真实公开接口烟测。

致谢应列杭州游卡网络技术有限公司/三国杀移动版官网、三国咸话公开社区 API；华为文档只作为登录能力研究依据，当前没有调用华为 API。请不要把未调用的接口列为已连接 API。

## 授权能力补全（同日追加）

继续查验官方旧社区的登录弹窗 <https://xianhua.sanguosha.cn/_nuxt/default.fd6ebdba.js>，其文案明确为“打开三国咸话APP扫一扫登录”；`POST https://hi-gateway.sanguosha.cn/api/login/v1/qrcode` 传 JSON `null`，返回 `{code:0,data:{qrcode:...}}`；`GET` 同端点传 `qrcode` 查询参数，未扫码返回 `{code:0,data:{token:""}}`。官方前端直接保存扫码后的 `data.token` 作为 Authorization，再查询 wxforum `/profile`。这是真实社区授权，不是游戏密码登录，也没有已证实的华为渠道标识。

新版扫码匿名实测：`generateId` 返回 code1000、非空 scanId、`expireIn:300`；未扫码 `poll` 返回 code1000、`status:"pending"`、空 appletToken。两套流程均只生成临时二维码并查询未扫码状态，本次没有任何用户扫码或取得真实会话。旧版弹窗轮询为每2秒、60轮，插件采用120秒轮询窗口并注明这是前端窗口而非服务器返回的精确有效期。

新增原创模块 `lib/community-auth.mjs`：优先支持 `app-qr-v1`（三国咸话APP），也支持 `pc-scan-v7`（微信扫码，需官方网页交换WEB_SESSIONID）。`start` 返回待扫码请求；`poll` 取得凭证后必须再通过官方本人资料端点验证，才返回社区授权 session。待扫码、过期、失败都不会标记成功。模块不保存或打印会话；Bot核心负责用AES加密保存、只允许本人私聊查询。

旧版有效社区会话可调用的**协议已核实但本人字段尚未现场验证**查询：profile、summary、force、records（0全部/1排位/2身份/3国战/4斗地主）、recent（`user/getGameRecordList`，官方前端实参 `{model,page}`）、gameInfo、assets、skins、abilities、bestGeneral、favorites。新版仅接已核实的profile、summary、roles（`user/getAllOtherGameUser`返回角色映射来源）。不把旧版token投向未核实的新接口，不猜客户端凭据，不编造绑定接口。官方角色尚未关联时，业务code20020返回需在官方APP关联角色。

私有返回数据递归去掉Token/Cookie/密码/手机号/邮箱/实名/身份证/IP/设备标识等字段，保留本人授权的武将、皮肤、资产和统计。社区授权始终标记 `gameAuthenticated:false`、`channelVerified:false`；官号与华为渠道登录仍保留原有 unsupported 状态。旧社区未找到服务器撤销端点，退出只删除插件本地加密会话并准确告知，未声称注销其他客户端。

当前单元测试16项通过，覆盖两套扫码、本人验证、未扫码/过期、角色关联、凭据隐藏、固定端点、渠道登录隔离等。真实官网HTML解析已验证：588个武将、刘备3条分模式技能/8张公开皮肤图、15条公告、9条新手攻略、模式4个详情段、将池附2图。本机Node直连www.sanguosha.cn遇到连接超时，而PowerShell读取正常、社区API正常；Bot Linux部署需进一步现场烟测。测试并不意味着未执行的本人授权查询已成功。
