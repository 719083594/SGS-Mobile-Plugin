const login=(channel)=>({title:'三国杀移动版 · '+channel+'说明',subtitle:'社区授权与游戏登录是独立流程',groups:[
 {title:'社区微信授权',items:[{command:'#sgs登录',description:'本人私聊，用微信扫一扫官方二维码并确认，无需发送密码或登录凭据。'},{command:'#sgs扫码状态 / #sgs授权状态',description:'查看扫码进度，或查看本地已保存的授权；原有日常命令名称不变。'},{command:'#sgs取消扫码 / #sgs退出授权',description:'取消只清待扫码请求、保留原授权；退出清除全部本地授权与待扫码内容。'}]},
 {title:'授权切换与查询范围',items:[{command:'本人校验成功后移除本 Bot 旧凭证',description:'等待、失败、过期或取消时保留原授权，不注销官方其他客户端。'},{command:'本人查询已统一新版',description:'资料、战绩、资产均可查；拥有列表每页12项，武将可按势力筛选。'}]},
 {title:channel+'游戏登录',items:[{command:channel+'游戏授权协议尚未接通',description:'社区扫码不等于官号或华为游戏渠道登录。'},{command:'#sgs绑定 '+(channel==='官号'?'官号':'华为')+' 游戏ID [区服]',description:'仅加密保存游戏身份，不取得游戏登录或战绩授权。'}]},
],footer:'#sgs退出授权 清除本人全部本地授权与待扫码请求。请勿转发二维码或发送密码、令牌。'});
export const helpTopics={
 'sgs-official-login':login('官号'),
 'sgs-huawei-login':login('华为'),
 'sgs-features':{title:'三国杀移动助手 · 功能',subtitle:'移动版专用 · 官方公开资料与三国咸话',groups:[
  {title:'武将与皮肤图鉴',items:[{command:'#sgs全部武将 / #sgs吴国武将',description:'官网已收录目录；“武将列表 蜀 2”查蜀国第2页，不代表本人拥有'},{command:'#sgs皮肤图鉴 / #sgs关羽皮肤',description:'官方至尊、传说、原画展示；“皮肤图鉴 至尊 2”可翻页，不等同客户端全皮肤'}]},
  {title:'公开资料',items:[{command:'资讯 / 活动 / 公告 / 武将 / 攻略 / 模式',description:'官方移动版资料和社区动态'}]},
  {title:'本人游戏统计',items:[{command:'#sgs战绩 排位',description:'“近期战绩 身份 1”按页查询；图片/样本最多前10场，本批可私聊导出。'},{command:'#sgs胜率 排位 / #sgs势周瑜胜率排位',description:'按模式查本人总览或指定武将；群内只查发送者本人，未返回不当作零胜率'},{command:'#sgs将力 / #sgs能力 / #sgs擅长武将',description:'当前官方战力、能力与擅长武将资料，不回退旧授权或旧查询接口'}]},
  {title:'本人拥有与私密资料',items:[{command:'#sgs我的武将 [势力] [页]',description:'每页12项；魏蜀吴群神可筛。“我的吴国武将 [页]”也可用，总拥有量与筛选数分开'},{command:'#sgs我的皮肤 [页]',description:'本人官方拥有皮肤，每页12项；不支持按武将名搜索，私聊“#sgs皮肤”也可查看'},{command:'个人资料 / 资产 / 游戏资料',description:'资产11类道具独立图标；敏感资料及 JSON 导出仅私聊，公开图鉴不代表本人拥有'}]},
  {title:'登录与保存',items:[{command:'#sgs登录 / #sgs扫码状态',description:'本人私聊，用微信扫一扫官方二维码；验证成功后 AES 加密保存'},{command:'#sgs授权状态 / #sgs取消扫码',description:'成功才移除本 Bot 旧凭证，失败或取消保留原授权；本人查询统一当前官方接口'},{command:'#sgs退出授权',description:'清除全部本地授权与待扫码。官号、华为游戏独立登录尚未接通'}]},
 ],footer:'统计范围以官方返回为准。未返回不能视为零胜率。无签到、点赞、分享、兑换或领奖功能。'},
};
