# 三国杀移动版接口审计

核验日期：2026-10-07（Asia/Shanghai）。本插件只接用户指定的 [三国杀移动版官网](https://www.sanguosha.cn/) 及其官方 [三国咸话](https://xh.sanguosha.cn/web/2)，不使用OL、十周年或其他版本个人接口。实现为原创调用与展示逻辑；研究仅有界读取官方公开网页、JavaScript与APK，没有运行APK或复制官方实现源码。公开记录不含私人数量、身份、令牌、二维码或原始个人响应。

**当前本人登录与查询统一官方微信社区授权 `pc-scan-v7`。资料、游戏概览/资料、将力、能力、分模式战绩/胜率、近期对局、擅长武将、资产以及拥有武将/皮肤分页均已接入当前官方接口并进行授权只读验证。旧APP扫码及旧个人查询协议已移除；旧凭证不会用于当前查询，也不作为故障回退。** 官号、华为游戏独立登录与渠道角色认证仍未接通。早期APP协议结论仅留在 [历史验收记录](VERIFICATION.md)，不能作为当前协议可用性的证明。

## 当前微信授权

协议证据来自官方 [社区授权构建资源](https://cf-resources.sanguosha.cn/web/c2d4aC13ZWI/_next/static/chunks/400-e9aa5397ef7c35d9.js)。官方网页创建 `POST https://api-xh.sanguosha.cn/sgxh/pcScan/generateId`，请求指定游戏；微信扫描官方 `xh.sanguosha.cn/web/scan/weixin` 页面，在官方页面确认。`POST /sgxh/pcScan/poll` 完成后取得票据，再交给官网同源 `/web/api/auth/login`；浏览器会话由 `WEB_SESSIONID` cookie取得，官网HTTP客户端直接请求 `api-xh.sanguosha.cn`。只有票据交换与注销使用同源网页端点。构建文件名可能变化，这些链接是核验来源，不是运行时下载或执行的依赖。

Bot使用 `#sgs登录` 生成本地编码的官方二维码，`#sgs扫码状态` 查询进度，`#sgs取消扫码` 取消本次请求。票据交换后必须再通过 `/user/userInfo` 的官方本人 `userId` 严格校验，不能使用旧资料的 `id` 或调用者传入的身份替代。待扫码、失败、过期或取消均保留原本地授权记录；只有当前身份校验成功才原子替换主会话并移除本Bot旧凭证及全部待扫码内容。保留旧记录不恢复旧协议查询。

`#sgs授权状态` 只显示本地记录与待扫码状态，不输出凭据；`#sgs退出授权` 清除全部本地授权与待扫码。当前协议尝试官网 `/web/api/auth/logout`，远程失败仍删除本地记录，不宣称注销其他官方客户端。扫码、敏感资料和全部JSON导出仅本人私聊；不会收集用户密码或短信验证码，不把二维码发送给第三方绘码服务。

## 当前本人查询端点

当前查询端点均在固定 `https://api-xh.sanguosha.cn` 下，参数严格白名单，默认GET；`/user/userInfo` 为POST。来源为当前官方 [接口封装](https://note.sanguosha.cn/record/assets/index-Oam2QQVM.js)、[战绩页面](https://note.sanguosha.cn/record/assets/index-CXtl96WG.js) 和社区网页。访问身份只取已验证的当前会话，不接受命令指定他人授权。

| kind | 端点 | 当前范围 |
| --- | --- | --- |
| profile | `/user/userInfo` | 校验当前社区本人身份；不是游戏渠道认证 |
| summary | `/user/gameSummary` | 本人游戏概览；Bot“个人资料”使用此结果 |
| roles | `/user/getAllOtherGameUser` | 其他游戏角色映射响应；不据此声明官号/华为渠道认证 |
| gameInfo | `/user/generalGameInfo` | 游戏资料、段位、官方场次与拥有统计 |
| assets | `/user/gameProperty` | 11类官方道具字段；缺失不填0 |
| force | `/user/gameForce` | 五项官方战力，未解释字段保留原名 |
| records | `/user/gameCareerUserInfo` | 当前模式正式生涯统计 |
| recent | `/user/gameRecordList/total` | 当前模式近期批次，图片/样本最多前10条 |
| abilities | `/user/gameGeneralAbilities` | 官方能力响应，不从缩写猜中文含义 |
| bestGeneral | `/user/gameBestGeneralNew` | 当前模式的擅长武将子集 |
| ownedGenerals / ownedSkins | `/user/gameGeneral/total` | 本人拥有武将/皮肤官方分页，每页12条 |

Bot模式编号 `0全部/1排位/2身份/3国战/4斗地主` 映射为当前官方 `mode` 的 `0/4/1/2/3`，不能把Bot编号直接作为旧协议参数沿用。近期请求以当前模式和页码调用，展示官方模式名、秒级时间转换的上海时间、本人结果及明确属于本人武将的名字/头像；不输出其他玩家列表。正式统计与近期本批前10条样本胜率分别显示，未知结果排除，不把当前批次说成完整历史。实际授权只读复核发现请求size=10时部分模式会返回超过10条；官方APP直接接收list，H5没有相同size约束，因此不能承诺服务器每页上限10。插件接受最多100条的有界安全投影，图片和头像准备只取前10条，本人私聊导出保留完整本批JSON。相邻page=1/2已在内存验证返回不同有序批次，因此保留按官方页码请求的命令；size不是响应条数上限。指定武将胜率仅取当前模式官方擅长列表的精确匹配，不跨模式或用近期使用列表回填。

官方资产字段为元宝、将魂、雁翎、招募令、雁翎甲、史诗宝珠、点将卡、欢乐豆、手气卡、心愿积分、银币。`game_force` 的五项为综合、斗地主、排位、国战、身份战力；官方图表轴8000不是数值上限。`general_power` 暂无已核实中文标签，保留原字段名，不据此直接宣称将力或排名。字段标签、百分比与缺失值处理见 [PERSONAL-FIELDS.md](PERSONAL-FIELDS.md)。

## 本人拥有分页

`GET /user/gameGeneral/total` 由 [官方公开三国咸话APK](https://hidownload.sanguosha.cn/apk/sgxh_yoka.apk) 有界静态调用证据与当前微信会话实际读取共同确认。武将/皮肤按官方参数独立查询，`toUserId` 只取当前官方本人校验的身份；武将支持魏、蜀、吴、群、神势力，皮肤仅全部。

内存逐页核验已确认两类全部条目严格 `isHave:true`、ID无重复、计数稳定、末页长度和越界下一页为空；吴国首末页 `country/country2` 与官方筛选一致。`have` 是本人全部拥有数，`searchNum` 是筛选匹配拥有数，原 `total` 是游戏总数，不互相混写。Bot每次仍只查询当前一页12项，显示三类统计、本页数和保留筛选的下一页命令；只有一页涵盖所有匹配时才标记该页完整，不宣称当前页已下载全量。

无效条目、重复ID、计数或分页结构不一致时整页拒绝，不静默过滤后继续称完整。本人内部ID不猜配公开目录/绘影堂ID。武将头像仅按唯一精确名称使用本地公共头像；皮肤只匿名读取响应内 `sjpubicres.sanguosha.cn/release/character_skins/skins/` 固定目录的图片，不发送凭据、不跟随重定向，图片仅在本次内存。`iconUrl` 是品质小标，不作为皮肤原画。`/user/gameGeneral/search` 未证明仅拥有筛选契约，不用于本人皮肤按武将搜索。

空参 `#sgs皮肤` 是“我的皮肤”的兼容入口，`#sgs武将收藏` 是“我的武将”的兼容入口；旧社区喜欢查询已删除，不再表示社区点赞收藏。公开图鉴、近期使用、擅长武将和任何社区热榜均不能补全本人拥有列表。

## 匿名公开资料

| 来源 | 固定请求范围 | 结果与边界 |
| --- | --- | --- |
| [移动版官网](https://www.sanguosha.cn/) | `/pc/news-list-*`、`news-detail-*` | 资讯、分类、日期、原文与图片；图片将池/概率不伪造OCR名单 |
| 同上 | `/pc/hero-list.html`、`hero-detail-*` | 官网收录武将、势力、简介、技能/模式和公开皮肤图，不是本人拥有 |
| 同上 | `/pc/guide-list-*`、`guide-info-*`、`mode-info-*` | 官网攻略和模式介绍；来源原文保留 |
| [官方皮肤绘影堂](https://share.sanguosha.cn/skins/) | `GET /api/skins/list`，type1/2/3与官方分页 | 至尊/传说/原画公开展示，不等同客户端全皮肤 |
| [官方社区](https://xianhua.sanguosha.cn/) 的 `wxforum.sanguosha.cn` | `/api/topics`、`searchV2/topics`、`rank/today/theme/week/all` | 匿名帖子、攻略搜索、热度及人气榜；不是游戏排位榜 |

公开帖子和热榜仍使用官网可见的匿名公共接口，不发送社区会话；删除旧个人授权不影响这些公开来源。原始帖子中的无关IP、地址和完整用户对象不输出或保存，公开展示只保留需要的标题、摘要、日期、来源、作者昵称与互动计数。协议来源为官方 [公开列表](https://xianhua.sanguosha.cn/_nuxt/home.f8ac2989.js)、[武将/攻略定义](https://xianhua.sanguosha.cn/_nuxt/generalApi.059ef62f.js) 和 [公共API定义](https://xianhua.sanguosha.cn/_nuxt/baseApi.8d2df587.js)。

## 官号与华为游戏渠道边界

微信扫码建立 `sanguosha-community` 社区会话，仍明确 `gameAuthenticated:false`、`channelVerified:false`。官网 [隐私政策](https://www.sanguosha.cn/sgs_agreement/index.html) 介绍游戏产品本身的登录方式，但不能据此宣称第三方插件已取得游戏渠道票据或角色归属协议。身份登记只是按官号/华为分开加密保存，不验证归属。

移动版 [第三方SDK清单](https://www.sanguosha.cn/sgs_agreement/SDK_info.html) 列出华为Game Service，华为 [官方游戏服务](https://developer.huawei.com/consumer/cn/hms/huawei-game) 有登录能力。但独立应用的OAuth或玩家标识不能自动换成三国杀移动版游戏会话。华为 [令牌交换文档](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/account-api-obtain-user-token) 与 [游戏登录接入示例](https://developer.huawei.com/consumer/en/codelab/HMSGameKit/index.html?cardName=HMSGameKit&lang=en) 要求适用的应用配置与权限，本插件未调用这些游戏授权端点，也未使用游戏官方应用身份。

当前缺口仍为供插件接入的官号/华为游戏授权、游卡渠道角色映射、完整游戏排行榜、完整对局历史和与APP逐功能覆盖对照；不因当前社区查询成功宣称这些已完成。

## 隐私与验证

按QQ隔离的身份、会话和待扫码内容整体AES-256-GCM保存；密钥与加密文件不进Git。本人响应递归去掉凭据、联系方式、实名、IP、设备和账号标识；群内仅分享发送者自己的游戏统计，再按字段白名单投影，其他个人信息和所有JSON导出只在本人私聊。Bot个人图片、二维码与文件采用内存Buffer，大JSON在内存gzip；CLI只输出终端，不自动保存明文本人文件。

自动化测试覆盖当前协议端点、模式、分页、所有权、身份/私聊隔离、凭据隐藏、大小限制、加密和图片完整解码；真实接口探测与QQ投递分别验证。公开审计只保留结果类别和结构结论，不包含私人原始负载。接口失败时明确提示，不伪造成功、不猜新端点、不回退已删除的旧授权协议。
