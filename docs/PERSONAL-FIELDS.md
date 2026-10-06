# 本人资料中文显示与字段证据

核验日期：2026-10-07。`lib/format-personal.mjs` 是原创显示逻辑，依据官方网页中 API 方法、返回数据变量与相邻中文标签的绑定关系制作。没有复制官方页面组件或查询真实账号接口。以下映射仅应用于 `app-qr-v1`；新版微信及未知协议继续保留官方字段名，不套用旧接口含义。

## 官方来源

- [接口方法与路径](https://xianhua.sanguosha.cn/_nuxt/recordApi.2943a9d0.js)：`userRecordHome` 对应 summary，`userGameInfo` 对应 force，`allGameRecord/recentGameList` 对应 records/recent，`h5UserInfo/h5ObtainDetail` 对应 gameInfo/assets。
- [PC 个人战绩页](https://xianhua.sanguosha.cn/_nuxt/record.70e69d2f.js)：概览、胜率、各模式统计、近20场结果、近期对局与最高段位。
- [H5 我的战绩页](https://xianhua.sanguosha.cn/_nuxt/record.5e722f27.js)：游戏资料、各模式胜率计算与欢乐豆。此文件和下一文件的名称来自官方构建资源清单，只读取得公开 JavaScript，没有携带会话或请求个人数据。
- [H5 资产详情页](https://xianhua.sanguosha.cn/_nuxt/obtain.cb450439.js)：道具中文标签及武将、皮肤统计展示。

官方构建文件名可能随发布变化；上述链接是本次核验依据，不是插件运行时下载或执行的依赖。

## 已解释的字段

| kind | 字段与显示含义 | 解释边界 |
| --- | --- | --- |
| summary | `nick_name` 昵称、`lv` 等级；`general_all_count` 武将总数、`skin_all_count` 皮肤总数 | 两个总数是 PC 拥有统计的分母，不是本人的拥有量 |
| force | `game_total` 总场次、`game_win` 获胜场次、`win_rate` 胜率、`general_count` 拥有武将、`skin_count` 拥有皮肤 | `win_rate` 在官方页面直接加 `%`，不再次乘100；不从接口名猜测其他字段是将力分数或排名 |
| records / 排位 | `paiweiRate.total` 场次、`paiweiRate.total_rate` 胜率 | 模式标签来自官方选择列表 |
| records / 身份 | `shenfenRate` 中 `total_rate` 总胜率、`emperor_rate` 主公、`minister_rate` 忠臣、`rebel_rate` 反贼、`provocateur_rate` 内奸胜率 | 百分数字段直接显示，不重新计算 |
| records / 国战 | `guozhanRate` 中 `total_rate` 总胜率、`wei_rate/shu_rate/wu_rate/qun_rate/ye_rate` 魏国/蜀国/吴国/群雄/野心家胜率 | 百分数字段直接显示 |
| records / 斗地主 | `doudizhuRate.total` 场次、`total_rate` 总胜率、`lord_rate` 地主胜率、`peasant_rate` 农民胜率 | 不与 gameInfo 的胜场、总场次字段混用 |
| records / 其他 | `recent[].name` 近期使用武将；`g20[]` 近20场结果；`medals` 用于排位最高段位 | 近期使用不等于拥有列表。官方结果图仅有零/其他两分支，未提供完整结果码枚举；摘要仅将0显示为胜、1显示为负，其余显示未知，原值保留在导出中。最高段位按官方顺序取正数项：`chuanshuo` 传说、`wanmei` 大师、`feicui` 翡翠、`huangjin` 黄金、`baiyin` 白银、`qingtong` 青铜；未返回的段位不填造 |
| recent | 数组项 `Model` 模式、`begin_time` 时间、`result` 结果 | 原样使用官方显示值，不猜时间单位或转换日期；分页与摘要条数不代表完整历史 |
| assets | `yb` 元宝、`jh` 将魂、`yl` 雁翎、`zml` 招募令、`ylj` 雁翎甲、`ssbz` 史诗宝珠；`hld` 欢乐豆 | 前六项直接来自资产页，欢乐豆来自 H5 战绩页；缺失字段省略，不凭空填0，不把对象字段数当成资产 |
| gameInfo / 身份与段位 | `nick` 昵称、`lv` 等级、`vip` VIP、`nowDivision` 当前段位、`maxDivision` 最高段位、`maxTitle` 最高称号 | `official` 仅以原字段名保留，不猜译成军阶 |
| gameInfo / 游戏统计 | `rankWin` 排位胜场、`douDiZhuWin` 斗地主胜场、`totalGame` 总场次、`totalMvp` MVP；`generalNum/generalTotal` 武将统计、`skinNum/skinTotal` 皮肤统计 | 武将/皮肤以官网的分子/分母显示；统计量不等于完整名单 |

H5 页面将排位、斗地主及总胜率分别按 `rankWin/rankNum*100`、`douDiZhuWin/douDiZhuTotal*100`、`totalWin/totalGame*100` 截断为整数。格式器只有在分子、分母为有效数值、分母大于0且胜场不超过总场次时才按该公式显示；缺失或无效分母不伪造0%结果。

官方 PC 战绩页的直接证据：`g20` 图片条件为 `a==0?"victory":"lose"`；段位条件包含 `_.data.medals.wanmei>0?u="大师"`。前者只证明页面的两分支行为，不证明所有非零值都是已定义的失败码；因此格式器采用上述保守边界。

## 摘要、未知字段与完整导出

本人命令末尾加 `导出`，例如 `#三国资产 导出`、`#三国战绩 2 导出`、`#三国近期战绩 0 2 导出`，可获得该次响应的完整已脱敏 JSON。所有本人查询都支持此后缀；导出使用同一本人私聊权限与原有内存文件上传链路。命令前缀随实例配置变化。

摘要只显示有证据的字段，并提示未映射字段；数组摘要受 `maxItems` 限制。没有中文映射的结构继续保留官方字段名，内容过长自动转 JSON 文件。完整导出保留未知对象、数组及字段，沿用接口层既有隐私清洗、响应大小、层级与条数边界；不会为了显示摘要修改原始业务对象。`maxReplyChars` 控制摘要或原字段 JSON 的消息转文件阈值。

独立 `formatPersonal()` 默认执行隐私清洗；核心仅在取得 `CommunityAuthClient.queryOwn()` 已清洗结果后设置 `dataAlreadyRedacted:true`，避免对未知字符串再次解码或去标签。外部调用者不可对未经清洗的数据启用此选项。

Bot 仍仅在本人私聊通过 Buffer 发送文件，大文件沿用内存 gzip；CLI 仅输出文本/JSON，不自动保存明文文件。本次使用合成数据测试字段、百分比、缺失值、未知字段保留、导出参数及私聊隔离。与真实 APP 的逐项数值、更新时点、角色一致性和完整覆盖核对仍待完成，社区授权不因此变成官号或华为游戏登录。
