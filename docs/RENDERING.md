# 图片渲染与胜率

默认 `#sgs帮助` 从 `resources/ui/help.jpg` 读取；素材和源文件 SHA 与 manifest 不符时拒绝使用旧图。更新帮助源后须重新生成公开帮助图及 manifest。自定义前缀的帮助继续使用原 HTML 渲染路径。

资产、战绩、近期战绩、本人资料、收藏、能力、胜率及公开武将/资讯卡由 `lib/reply-cards.mjs` 构建原生 SVG，经 `lib/shared-renderer.mjs` 调用同级 AI-Plugin 的 `src/rendering/index.mjs`。复用 SGS 已安装的 sharp 0.35.5，不启动 Chromium，不需要 AI 接口、模型、密钥或第三方截图服务。共享服务说明见 AI-Plugin 的 `docs/RENDERER.md`。

个人卡只允许本人私聊，凭据按原加密库保存。官方响应、个人 SVG、图片和解密凭据均不落盘；只缓存公开的本地道具图标。头像通过已有可信本地素材解析，近期对局头像仅可从已核实的官方匿名素材目录在本次请求内存中准备。上游 URL 不能直接嵌入 SVG。服务只输出固定错误码、耗时和队列状态，日志不包含个人响应。失败时保留文字版和脱敏导出。

AI 共享渲染队列最多一项活跃、两项等待，原生转换实际结束后才释放；不以外层超时提前释放资源。公开图片也受同一输入和资源限制。共享服务不可用时不会悄悄启用浏览器重试。

## 胜率命令

| 命令 | 范围 |
| --- | --- |
| `#sgs战绩 [0-4]` | 原有战绩，加官方本人总/排位/斗地主统计及本模式近期样本胜率 |
| `#sgs胜率` | 官方本人统计与近20场，分别展示 |
| `#sgs势周瑜胜率` | 本人指定武将分模式统计；也支持 `#sgs势周瑜 胜率`、`#sgs胜率 势周瑜` |
| `#sgs胜率 导出` | 已筛选的统计 JSON，不含原始上游额外字段 |

来源均为三国杀**移动版**官方只读端点：

- `hi-gateway.sanguosha.cn/api/game/v2/general/gameInfo`：`totalWin/totalGame`、`rankWin/rankNum`、`douDiZhuWin/douDiZhuTotal`。
- `hi-gateway.sanguosha.cn/api/game/v2/general/bestGeneral`：`rank/identity/nationalWar/douDiZhu` 各条目的 `win/total`；雷达能力值不当作胜场。
- `wxforum.sanguosha.cn/api/user/getGameRecord`：`g20` 前20条中 `0` 为胜、`1` 为负，其他代码从分母排除；`recent` 的 `win_num/num/win_rate` 必须一致才使用。

胜率按有效胜场/场次计算，零场显示暂无记录。统计周期未标明；近期数据不视为完整生涯，官方擅长列表也不视为全部武将。未返回该武将时明确提示。此功能仅查询本人，不提供全服胜率，不执行签到、点赞、分享、兑换或游戏操作。

渲染软件致谢：[AI-Plugin](https://github.com/719083594/AI-Plugin) 共享服务、[sharp](https://sharp.pixelplumbing.com/) 与 [libvips](https://www.libvips.org/)。没有远程图片生成 API。
