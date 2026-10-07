# 致谢与数据/API来源

本项目为原创Node.js插件，源码采用GPL-3.0-or-later。感谢以下内容、协议研究依据和软件依赖；列入致谢不表示接口提供方为第三方插件提供官方支持或背书。核验日期与证据见 [API-AUDIT.md](API-AUDIT.md)。仅使用三国杀移动版，不连接OL、十周年、欢乐三国杀等其他版本个人接口。

## 官方内容

感谢 [杭州游卡网络技术有限公司 / 三国杀移动版](https://www.sanguosha.cn/) 的资讯、活动公告、武将/技能、攻略、模式和公开皮肤资料。插件原创解析官网 `/pc/news-list-*`、`news-detail-*`、`hero-list`、`hero-detail-*`、`guide-list-*`、`guide-info-*`、`mode-info-*`，保留原文来源。图片内的将池、概率以原文为准，公开皮肤不表示本人拥有。

感谢官方 [三国咸话](https://xh.sanguosha.cn/web/2)、[公共社区旧站](https://xianhua.sanguosha.cn/)、[APP介绍](https://hi.sanguosha.cn/pc/index.html)、[当前战绩页面](https://note.sanguosha.cn/record/) 与 [官方皮肤绘影堂](https://share.sanguosha.cn/skins/)。用户所称“三国闲话”对应官方名称“三国咸话”。

## 当前实际接入的API

| 来源主机 | 端点 | 用途与边界 |
| --- | --- | --- |
| [share.sanguosha.cn](https://share.sanguosha.cn/skins/) | `GET /api/skins/list`，type1/2/3、官方页码 | 绘影堂至尊/传说/原画公开展示目录；不发送社区凭据 |
| [wxforum.sanguosha.cn](https://xianhua.sanguosha.cn/) | `/api/topics`、`searchV2/topics`、`rank/today/theme/week/all` | 官方公开帖子、攻略搜索、热度和社区人气榜；匿名读取，不是游戏排位榜 |
| [api-xh.sanguosha.cn](https://xh.sanguosha.cn/web/2) | `/sgxh/pcScan/generateId`、`/sgxh/pcScan/poll` | 当前微信社区扫码生成与查询；Bot入口为登录/扫码状态 |
| [xh.sanguosha.cn](https://xh.sanguosha.cn/web/2) | `/web/api/auth/login`、`/web/api/auth/logout` | 官方扫码票据交换网页会话与注销；不承诺注销其他官方客户端 |
| [api-xh.sanguosha.cn](https://xh.sanguosha.cn/web/2) | `/user/userInfo`、`gameSummary`、`getAllOtherGameUser` | 当前本人身份校验、游戏概览、其他游戏角色映射，不代表官号/华为游戏认证 |
| 同上 | `/user/generalGameInfo`、`gameProperty`、`gameForce`、`gameGeneralAbilities` | 当前本人游戏资料、11类资产、官方战力与能力；未解释字段不猜译 |
| 同上 | `/user/gameCareerUserInfo`、`gameRecordList/total`、`gameBestGeneralNew` | 所选模式正式统计、近期本批前10条图片/样本和擅长武将子集；不当作完整历史或全部拥有 |
| 同上 | `GET /user/gameGeneral/total` | 当前本人拥有武将/皮肤，每页12项；武将支持魏/蜀/吴/群/神筛选，已逐页授权验证拥有标志、计数、去重和边界 |

当前所有个人查询使用`pc-scan-v7`；旧APP扫码和旧个人查询协议已删除。`#sgs皮肤`无参数兼容“我的皮肤”，`#sgs武将收藏`兼容“我的武将”，旧社区喜欢接口已删除。历史研究记录不列为当前已连接API，见 [早期验收记录](VERIFICATION.md)。没有接入手机验证码/密码登录，没有调用未核实游戏绑定或华为游戏授权端点。

## 官方协议研究来源

当前字段和端点依据官方 [战绩API封装](https://note.sanguosha.cn/record/assets/index-Oam2QQVM.js)、[战绩UI](https://note.sanguosha.cn/record/assets/index-CXtl96WG.js) 和 [当前社区授权构建资源](https://cf-resources.sanguosha.cn/web/c2d4aC13ZWI/_next/static/chunks/400-e9aa5397ef7c35d9.js)。公开帖子接口依据官方 [公共API定义](https://xianhua.sanguosha.cn/_nuxt/baseApi.8d2df587.js)、[公开列表](https://xianhua.sanguosha.cn/_nuxt/home.f8ac2989.js)、[武将/攻略定义](https://xianhua.sanguosha.cn/_nuxt/generalApi.059ef62f.js)。构建文件名随发布变化，链接为本次证据，不是运行时下载执行依赖；未复制官方组件或发布研究原始文件。

本人拥有分页还参考 [官方公开三国咸话APK](https://hidownload.sanguosha.cn/apk/sgxh_yoka.apk) 的有界静态调用分析，没有运行APK或发布反编译代码/二进制。`/user/gameGeneral/total`另有当前微信本人会话真实只读核验；其他候选端点不因此列为已接入。`/user/gameGeneral/search`没有已证明仅拥有过滤合同，不用于本人皮肤按武将搜索。

官网HTTP客户端直接请求`api-xh.sanguosha.cn`，Authorization来自网页`WEB_SESSIONID`；票据交换由同源`/web/api/auth/login`完成。插件只有官方本人身份校验成功才原子替换并删除本Bot旧凭证，等待/失败/过期/取消保留原本地记录，但不会恢复旧协议查询。社区会话不等于官号或华为游戏登录，当前两者独立授权仍未接通。

## 素材与图片

官方道具、武将和静态装饰来自`imagexh.sanguosha.com`与移动版官网，逐项原地址、哈希和大小保存在 [ASSETS.md](ASSETS.md) 与`resources/ui/assets/manifest.json`。近期头像只从`sjpubicres.sanguosha.cn/release/character_heads/`固定目录匿名读取；本人皮肤原画只从`sjpubicres.sanguosha.cn/release/character_skins/skins/`固定目录匿名读取，均不发送会话凭据，只留本次内存。品质小标不冒充皮肤原画；本人内部ID不猜关联公开目录。

公开绘影堂原图来自其声明的`sjwx-oss.sanguosha.cn/skins/image/`，本插件预先制作缩略图，`resources/skin-gallery/manifest.json`保存每个公开条目ID、名称、原地址与缩略图哈希。图鉴范围见 [CATALOG.md](CATALOG.md)。帮助排版、资产/头像/皮肤网格、分页、数量对照和内存绘图由本项目原创实现；五张原创SVG明确记录类别。

游戏、社区的内容、名称、图片和标识属于游卡及对应权利人，社区投稿属于作者；本项目未宣称官方图片具有开放素材许可或获得官方背书。保留原文链接，转载请遵守原站条款与作者要求。

## 登录研究与软件依赖

- [移动版第三方SDK清单](https://www.sanguosha.cn/sgs_agreement/SDK_info.html)、[华为游戏服务](https://developer.huawei.com/consumer/cn/hms/huawei-game)、[Account Kit](https://developer.huawei.com/consumer/cn/sdk/account-kit)、[令牌交换说明](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/account-api-obtain-user-token)：仅为游戏渠道能力研究依据，没有连接华为游戏账户API。独立应用授权不能自动换成三国杀移动版游戏会话。
- [node-qrcode / soldair](https://github.com/soldair/node-qrcode)，MIT：本地编码官方二维码，不把扫码凭据发送第三方绘码站。
- [AI-Plugin](https://github.com/719083594/AI-Plugin)共享原生渲染服务、[sharp](https://sharp.pixelplumbing.com/)（Apache-2.0）与[libvips](https://www.libvips.org/)（LGPL-2.1-or-later）：固定版本SVG转JPEG，动态个人卡只在内存生成，不调用在线绘图或AI模型。平台预编译组件许可证保留于npm包中。
- [Node.js](https://nodejs.org/)，MIT及第三方组件许可：ESM、Fetch、加密、文件与测试接口。
- [TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai)：Bot命令适配目标；核心查询可独立使用。橙汁配置声明未复制橙汁实现。

公开来源和授权协议可能变化；失败时提示实际限制，不伪造本人数据、认证成功或覆盖范围。
