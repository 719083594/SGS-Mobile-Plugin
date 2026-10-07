const login=(channel)=>({title:'三国杀移动版 · '+channel+'说明',subtitle:'社区授权与游戏登录是独立流程',groups:[
 {title:'社区微信授权',items:[{command:'#sgs登录',description:'本人私聊，用微信扫一扫官方二维码并确认，无需发送密码或登录凭据。'},{command:'#sgs扫码状态 / #sgs授权状态',description:'查看扫码进度，或查看本地已保存的授权；原有日常命令名称不变。'},{command:'#sgs取消授权 / #sgs退出授权',description:'取消只清待扫码请求、保留原授权；退出清除全部本地授权与待扫码内容。'}]},
 {title:'授权切换与查询范围',items:[{command:'本人校验成功后移除本 Bot 旧凭证',description:'等待、失败、过期或取消时保留原有效授权，不注销官方其他客户端。'},{command:'当前仅接资料、概览和角色映射',description:'战绩及全量拥有列表待接入验证，扫码成功不代表原有全部查询可用。'}]},
 {title:channel+'游戏登录',items:[{command:channel+'游戏授权协议尚未接通',description:'社区扫码不等于官号或华为游戏渠道登录。'},{command:'#sgs绑定 '+(channel==='官号'?'官号':'华为')+' 游戏ID [区服]',description:'仅加密保存游戏身份，不取得游戏登录或战绩授权。'}]},
],footer:'#sgs退出授权 清除本人全部本地授权与待扫码请求。请勿转发二维码或发送密码、令牌。'});
export const helpTopics={
 'sgs-official-login':login('官号'),
 'sgs-huawei-login':login('华为'),
 'sgs-features':{title:'三国杀移动助手 · 功能',subtitle:'移动版专用 · 官方公开资料与三国咸话',groups:[
  {title:'武将与皮肤图鉴',items:[{command:'#sgs全部武将 / #sgs吴国武将 / #sgs武将列表 蜀 2',description:'按官网已收录目录分势力、分页查看，不代表本人拥有'},{command:'#sgs皮肤图鉴 / #sgs关羽皮肤 / #sgs皮肤图鉴 至尊 2',description:'官方皮肤绘影堂的至尊、传说、原画展示；不等同客户端全皮肤'}]},
  {title:'公开资料',items:[{command:'资讯 / 活动 / 公告 / 武将 / 攻略 / 模式',description:'官方移动版资料和社区动态'}]},
  {title:'本人游戏统计',items:[{command:'#sgs战绩 排位 / #sgs近期战绩 身份 1',description:'战绩、近期战绩支持中文模式名或 0 至 4'},{command:'#sgs胜率 排位 / #sgs势周瑜胜率排位',description:'按模式查总览或指定武将；群内只查发送者本人'},{command:'#sgs将力 / #sgs能力 / #sgs擅长武将',description:'官方本次返回的本人游戏统计'}]},
  {title:'本人收藏与私密资料',items:[{command:'#sgs我的武将 [页] / #sgs我的皮肤 [页]',description:'官方拥有总数与本次返回数量分开显示；当前只返回部分收藏，不是完整拥有列表'},{command:'个人资料 / 资产 / 皮肤 / 游戏资料',description:'只在本人私聊查询；原始资料的 JSON 导出也仅私聊'},{command:'#sgs武将收藏',description:'社区“我的喜欢”，不等于已拥有武将'}]},
  {title:'登录与保存',items:[{command:'#sgs登录 / #sgs扫码状态',description:'本人私聊，用微信扫一扫官方二维码；验证成功后 AES 加密保存'},{command:'#sgs授权状态 / #sgs取消授权',description:'成功才移除本 Bot 旧凭证，失败或取消保留原授权；仅接资料/概览/角色映射'},{command:'#sgs退出授权',description:'清除全部本地授权与待扫码。战绩、全量收藏待验证；官号/华为游戏登录尚未接通'}]},
 ],footer:'统计范围以官方返回为准。未返回不能视为零胜率。无签到、点赞、分享、兑换或领奖功能。'},
};
