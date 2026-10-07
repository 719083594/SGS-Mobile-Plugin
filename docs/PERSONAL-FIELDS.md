# 本人资料字段与显示证据

核验日期：2026-10-07。原创格式器与原生卡片只接受当前 `pc-scan-v7`；旧APP协议和旧个人接口的积极显示支持已删除。中文含义来自当前官方接口封装与相邻UI标签，未核实字段保留原名，不沿用旧结构猜译。当前查询经本人授权只读核验，公开文档不保存私人响应。

## 官方来源

- [当前笔记战绩API封装](https://note.sanguosha.cn/record/assets/index-Oam2QQVM.js)：本人概览、游戏资料、资产、将力、能力、战绩、近期与擅长武将的当前端点和参数。
- [当前战绩页面](https://note.sanguosha.cn/record/assets/index-CXtl96WG.js)：资产11类标签、五项战力、模式、场次和比例显示。
- [官方战绩页](https://note.sanguosha.cn/record/) 与 [当前社区授权构建资源](https://cf-resources.sanguosha.cn/web/c2d4aC13ZWI/_next/static/chunks/400-e9aa5397ef7c35d9.js)：官方微信授权和网页会话交换。
- [官方公开APK](https://hidownload.sanguosha.cn/apk/sgxh_yoka.apk)：拥有列表接口与官方分页/筛选调用的有界静态证据，未运行APK。

构建资源文件名会随官方发布变化，以上是本次证据，不是插件运行时下载执行的依赖。端点范围与授权边界见 [API-AUDIT.md](API-AUDIT.md)。

## 已解释字段

| kind | 字段与显示 | 边界 |
| --- | --- | --- |
| summary | `nick_name`昵称、`lv`等级、`generalCount`拥有武将、`skinCount`拥有皮肤、`general_all_count/skin_all_count`官网总数 | 总数与本人拥有数分别显示，不能拿分母作拥有量 |
| force | `game_force.totalForce`综合、`doudizhuForce`斗地主、`paiweiForce`排位、`guozhanForce`国战、`shenfenForce`身份战力 | 以官方原值显示；图表8000轴不裁剪实际数值。`general_power`仅保留原字段名，未证明其中文含义 |
| records | 当前根对象 `winGames`胜场、`totalGames`场次、`rate`官方比例、`mvp`、`force`、`nowRank/maxRank`及`rates`分项 | 不套旧模式对象或旧段位枚举；有效正式场次与近期样本分开 |
| recent | 官方 `modeName`、秒级`beginTime`、明确结果码、本人的`players[].general`和`myGeneralAvatar`、MVP/逃跑 | 投影只取`isMe:true`武将名，时间转上海时区；不输出其他玩家或内部账号标识 |
| assets | `yb`元宝、`jh`将魂、`yl`雁翎、`zml`招募令、`ylj`雁翎甲、`ssbz`史诗宝珠、`dianj`点将卡、`hld`欢乐豆、`shouq`手气卡、`xiny`心愿积分、`yinb`银币 | 11类独立道具UI；有效0保留，缺失不填0，不从未知字段数推算资产 |
| gameInfo | `nick`昵称、`lv`等级、`vip`、`nowDivision/maxDivision`当前/最高段位、`maxTitle`称号；`rankWin/douDiZhuWin/totalGame/totalMvp`统计 | `official`等未解释值保留原名，不猜成军阶；仅按当前返回的同名字段显示 |
| gameInfo拥有统计 | `generalNum/generalTotal`、`skinNum/skinTotal` | 本人数量和官方分母一起显示，不等于完整名单 |
| abilities | `ri`排位、`ii`身份、`nw`国战、`ddz`斗地主，及各`Total`官方对比统计 | 模式前缀由当前UI的mode切换与下拉标签共同证明；`Total`不猜作个人总场次或数量单位 |
| bestGeneral | `list[].total/win`与`info.name`等 | 所选模式擅长武将子集；不是全部拥有或完整武将生涯清单 |

`records.rate` 的有效契约为0至1的比例，按官方UI乘100并加百分号，最多显示两位小数；原始JSON保留官方比例。正式胜率图与胜率命令优先使用有效`winGames/totalGames`，总场次0标为暂无记录，缺失或不一致的分母不伪造0%。官方角色分项`rates[].rate`同样按比例×100显示，仅接受已核实的模式角色标签；未知分项不猜译。

游戏资料的排位、斗地主及总胜率分别按 `rankWin/rankNum*100`、`douDiZhuWin/douDiZhuTotal*100`、`totalWin/totalGame*100` 截断为整数；只有数值有效、分母大于0且胜场不超过场次时显示。近期结果0为胜、1为负，其余为未知；未知不参与近期样本胜率，且最多只统计官方当前一页10场。近期记录不是完整历史，也不能替代正式战绩胜率。

Bot模式 `0全部/1排位/2身份/3国战/4斗地主` 对应当前官方 `mode=0/4/1/2/3`。查询和显示都保留所选模式；指定武将只精确匹配该模式的官方擅长列表，神、界、势不合并，不跨模式补值或把未返回武将当零胜率。

## 本人拥有分页

`pc-scan-v7` 的 `GET /user/gameGeneral/total` 按当前严格验证的本人`userId`限定身份，官方页面大小12。武将用`generals`，皮肤用`skins`；每项必须严格`isHave:true`。无效条目、重复ID或计数/分页不一致时整页拒绝。投影范围为 `official-own-paginated`。

| 官方字段 | 投影 | 显示 |
| --- | --- | --- |
| `have` | `ownTotal` | 本人全部拥有数；筛选时仍为全部势力拥有量 |
| `searchNum` | `total/filteredTotal` | 当前筛选匹配的本人拥有数，用于计算页数 |
| 原`total` | `catalogTotal` | 官方游戏总数，非本人拥有量或本页条数 |
| `generals/skins.length` | `returnedCount/items.length` | 当前页最多12项，序号按官方页码连续 |
| `countryType` | `countryType/countryLabel` | 0全部、1魏、2蜀、3吴、4群、5神；皮肤仅全部 |

已在内存逐页核验拥有标志、计数稳定、ID无重复、末页/越界页和吴国首末页筛选。Bot每条命令只取当前页，不长期保存本人图库；只有单页涵盖全部匹配时`complete:true`。`#sgs我的武将 [势力] [页]`、`#sgs我的吴国武将 [页]`、`#sgs我的皮肤 [页]`可翻页，下一页保留武将势力。本人皮肤不支持按武将名搜索；`#sgs关羽皮肤`是公开绘影堂。

`#sgs皮肤`无参数等同我的皮肤；`#sgs武将收藏`兼容我的武将，旧社区喜欢接口已删除。公开图鉴、近期使用和擅长列表都不能补全拥有目录。本人内部`id/generalId`不猜配公开目录。武将头像仅按唯一精确名称查本地公共头像，皮肤只用响应里的官方固定目录原画，`iconUrl`品质小标不能冒充皮肤。图片与本人原生卡仅留本次内存。

## 摘要与导出

`#sgs资产 导出`、`#sgs战绩 2 导出`、`#sgs近期战绩 0 2 导出`等取得该次查询的已脱敏JSON，仅本人私聊；拥有投影命令不提供全量导出。未映射字段保留官方名称，未知对象/数组不因摘要限制删除；近期结果先投影本人允许字段，其他玩家内容不会进入输出。胜率命令导出已筛选的统计字段，群内卡片与文字回退不附JSON。

`formatPersonal()`默认隐私清洗，核心只对已经由`queryOwn()`清洗的结果设置`dataAlreadyRedacted:true`，避免二次解码丢失业务文字；外部调用者不能对未经清洗数据启用此项。凭据、联系方式、实名、IP、设备及账号标识均过滤。Bot通过内存Buffer发文件，大JSON在内存gzip；CLI只输出终端，不自动保存明文本人文件。测试使用合成数据核对字段、百分比、缺失值、未知值、导出、私聊隔离和实际图片解码。更广的APP覆盖与不同角色一致性仍需逐项核对，社区授权不构成官号/华为游戏认证。
