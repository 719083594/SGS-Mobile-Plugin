# 图片素材与字段证据

核验日期：2026-10-07。`lib/ui-assets.mjs` 提供离线素材解析；`resources/ui/assets/manifest.json` 逐项记录公开来源、文件大小、尺寸、SHA-256 和素材类别。仓库不保存用户截图、玩家昵称、道具数量、个人头像、授权响应或凭据。截图对照只用于说明新增字段的显示名称，不将截图中的真实数值放进源码或样图。

## 道具

| 字段 | 中文显示 | 字段依据 | 图标 |
| --- | --- | --- | --- |
| `yb` | 元宝 | 官方资产详情页直接绑定 | 官方 `sgxh-h5/dj1.png` |
| `jh` | 将魂 | 官方资产详情页直接绑定 | 官方 `sgxh-h5/dj2.png` |
| `yl` | 雁翎 | 官方资产详情页直接绑定 | 官方 `sgxh-h5/dj3.png` |
| `zml` | 招募令 | 官方资产详情页直接绑定 | 官方 `sgxh-h5/dj4.png` |
| `ylj` | 雁翎甲 | 官方资产详情页直接绑定 | 官方 `sgxh-h5/dj5.png` |
| `ssbz` | 史诗宝珠 | 官方资产详情页直接绑定 | 官方 `sgxh-h5/dj6.png` |
| `hld` | 欢乐豆 | 官方 H5 战绩页直接绑定 | 原创金豆示意图 |
| `dianj` | 点将卡 | 用户提供的本人截图对照；公开 API 字段绑定未独立确认 | 原创红金令牌示意图 |
| `shouq` | 手气卡 | 用户提供的本人截图对照；公开 API 字段绑定未独立确认 | 原创蓝金菱牌示意图 |
| `xiny` | 心愿积分 | 用户提供的本人截图对照；公开 API 字段绑定未独立确认 | 原创古铜心币示意图 |
| `yinb` | 银币 | 用户提供的本人截图对照；公开 API 字段绑定未独立确认 | 原创银色钱币示意图 |

前六项的标签、值、图标是官方 [资产详情构建文件](https://xianhua.sanguosha.cn/_nuxt/obtain.cb450439.js) 中同一展示节点的绑定关系，图标原地址均为 `https://imagexh.sanguosha.com/sgxh-h5/djN.png`。`hld` 的值在官方 [H5 战绩页](https://xianhua.sanguosha.cn/_nuxt/record.5e722f27.js) 用作“欢乐豆”。

官方 [道具介绍](https://www.sanguosha.cn/news-info.html?from=guide&id=87) 确认点将卡、手气卡、银币这些道具名称；官方 [谷雨活动](https://www.sanguosha.cn/pc/news-detail-2298.html) 确认心愿积分名称。这些文章不提供其缩写 API 字段与数值的绑定合同，因此后四项仍是 `fieldVerified:false`、`fieldEvidence:user-screenshot-correspondence`，没有冒充官方字段协议。

五张原创 SVG 明确标记 `original-vector-placeholder`，不是官方 APP 图标，也没有从用户截图裁切或生成。它们只区分道具类别；不得据此宣称已经取得五项官方图标。本次只读查询中 `dj7.png` 至 `dj11.png` 返回 404，不能通过延续序号猜造官方图标。

## 头像、将灯与战绩

官方 [PC 战绩页](https://xianhua.sanguosha.cn/_nuxt/record.70e69d2f.js) 的 API 与展示变量可直接对应：

- `summary.avatar` 用作头像；`summary.light[]` 逐项显示为图片。这里只确认图片字段，不从图片颜色猜将灯等级或数量。
- `force.official_pic` 与 `force.official` 相邻显示。这里只确认文字和图片组合；未独立取得数值军阶等级协议。
- `recent[].general_avatar[0]` 用作该条战绩的武将头像，`Model`、`begin_time`、`result` 用作模式、时间、结果。旧网页没有对每场 MVP 字段的可核实绑定，因此不猜 `mvp`、`isMvp` 等字段含义。

这段近期列表也没有引用 `general_name`、`generalName`、`general_names` 或其他武将名称字段。`records.recent[].name` 属于另一个接口的近期使用列表，不能移植为每场战绩名字。前端未引用某字段不等于证明 API 永不返回它；本次仅记录当前已取得的展示证据。

官方 [H5 战绩页](https://xianhua.sanguosha.cn/_nuxt/record.5e722f27.js) 使用 `gameInfo.head` 作为头像；游戏生涯区的“将灯”标签对应 `lights[]` 图片数组。另一个生涯图文列表 `titleList[]` 展示 `url`、`name`、`num`，`num>0` 控制灰色状态；该列表不等于将灯。`totalMvp` 明确属于生涯总统计，不是最近某场的 MVP 状态。军阶与将灯图若没有被公开目录收录，不会为了显示而下载个人响应中的任意地址。

武将图片来自 [移动版官网公开目录](https://www.sanguosha.cn/pc/hero-list.html)，不是从个人战绩、个人截图或玩家头像获取。本次已补齐官网目录的 588 条公开头像，清单 `missing` 为空；同名武将按各自的官方图片 URL 精确匹配。单图不超过 256 KiB。官网目录编号不等于已证明的游戏内部武将编号，调用方不可把未知游戏 ID 自动当成官网 ID。部分官方 JPG 地址返回 PNG 内容，原有素材只校正文件扩展名；新增的 16 张头像解码后制作 88×88 缩略图，清单同时保留官方原图 URL、原始字节 SHA-256 与缩略图 SHA-256。

## 解析接口与权限边界

```js
import {createAssetResolver} from './lib/ui-assets.mjs';
const assets = createAssetResolver(pluginRoot);
assets.items; // 11 项 { key, label, fieldVerified, fieldEvidence, iconKind, ... }
assets.imageForItem('yb'); // 本地 file: URL 或 null
assets.imageForGeneral('刘备'); // 公开目录精确名字
assets.imageForGeneral(1); // 仅指官网目录编号
assets.imageForGeneral('https://www.sanguosha.cn/storage/uploads/images/pic_index/1.png');
assets.imageForDecoration('default-avatar'); // default-avatar / victory / lose
assets.imageForOfficialStatic('https://imagexh.sanguosha.com/sgxh-pc/default_avatar.png');
```

这些方法同步运行、没有网络请求，只返回清单已登记且哈希一致的本地文件。名称不模糊匹配，同名不同图片时返回空；未知头像、外站 URL、HTTP、带查询参数或凭据的 URL、`data:`、任意文件地址均不能变成图片资源。文件与每级目录拒绝软链接/junction，文件拒绝硬链接；超限、哈希变化、损坏素材返回空。原创 SVG 不含外链或脚本，解析器还检查相应危险元素和引用。

本模块只选择素材，不自行发送本人资料；权限仍由核心本人私聊守卫执行。卡片渲染应继续禁用网络与脚本、限制读取本插件素材目录，使用现有内存 Buffer 发送链路。

## 近期武将头像的本次内存读取

线上近期列表的武将头像来源与官网目录不同，使用 `https://sjpubicres.sanguosha.cn/release/character_heads/`。`lib/memory-portraits.mjs` 增加独立准备步骤 `await preparePortraitResolver(result, baseResolver, options)`，只处理 `kind:recent` 的前20条，每条只取 `general_avatar[0]`。它不会读取 `summary.avatar` 或游戏玩家自定义头像，也不将个人接口、会话或截图传给绘图服务。

请求固定为匿名 GET，不带 Cookie、Authorization 或请求体，禁重定向、禁 HTTP、端口、凭据、查询串及片段；文件名仅允许1至100个英文字母、数字、下划线或短横线和 PNG/JPG/JPEG 扩展名。只接受该固定域名及目录，不接受任意头像地址。

默认最多三路并发、20张，单图256 KiB、累计流读取2 MiB；同时检查 `content-length` 与实际流大小，验证 PNG/JPEG 魔数及尺寸（最大边2048像素、总像素不超过4194304）。请求默认5秒，整批默认12秒截止。上限不能通过 options 放大。失败、超时、超限或错误返回都回退原素材解析器，不影响会话。

新增图片只存在该次返回解析器的内存 Map 中，`imageForGeneral(exactURL)` 返回 base64 PNG/JPEG `data:` 图片；其他方法保留原解析器行为。没有磁盘写入、日志、全局缓存或跨次复用，也不把这些 URL 及响应写进素材清单。视图与渲染器仍须分别校验数据图片类型/大小，并保持页面禁网、禁脚本和本人私聊发送边界。

本次9项离线测试覆盖匿名请求、严格 URL、去重与数量/并发硬限制、重定向与错误、声明/流限额、伪图片/尺寸、跨次隔离和截止时间；测试使用合成结构及已公开的测试图片，没有查询真实账号接口。线上响应含 `mvp` 字段，但已核实的官方近期 UI 没有使用它，仍不猜测其值或标出每场 MVP。

## 版权与致谢

官网与官方社区的图片版权归游卡及各原权利人。公开可下载不代表取得开放图片许可证；本次未找到这些图片的开放许可。清单将官方素材与本插件原创 SVG 分开记录，插件的代码许可证不覆盖第三方图片版权。感谢三国杀移动版官网、三国咸话公开 UI 资源与武将资料，以及用户提供截图用于功能对照。若发行方式需要另外的素材授权，请按权利人的许可处理。
