const login=(channel)=>({title:'三国杀移动版 · '+channel+'说明',subtitle:'社区授权与游戏登录是独立流程',groups:[
 {title:'当前可用：三国咸话本人授权',items:[{command:'1. 私聊 #sgs社区授权',description:'用三国咸话 APP 扫描二维码并确认。每位使用者单独授权。'},{command:'2. 私聊 #sgs扫码状态',description:'验证成功后会话以 AES 加密保存。'},{command:'3. #sgs战绩 / #sgs胜率 排位',description:'群内可展示发送者自己的游戏统计；资产等完整资料仅私聊。'}]},
 {title:channel+'游戏登录',items:[{command:channel+'游戏授权协议尚未接通',description:'当前不宣称游戏账号登录成功。社区关联角色是否存在，以官方接口实际返回为准。'},{command:'#sgs绑定 '+(channel==='官号'?'官号':'华为')+' 游戏ID [区服]',description:'仅加密保存游戏身份，不取得游戏登录或战绩授权。'}]},
],footer:'三国杀移动版官网 sanguosha.cn。请勿在群里发送二维码、密码、令牌或授权回执。'});
export const helpTopics={
 'sgs-official-login':login('官号'),
 'sgs-huawei-login':login('华为'),
 'sgs-features':{title:'三国杀移动助手 · 功能',subtitle:'移动版专用 · 官方公开资料与三国咸话',groups:[
  {title:'公开资料',items:[{command:'资讯 / 活动 / 公告 / 武将 / 攻略 / 模式',description:'官方移动版资料和社区动态'}]},
  {title:'本人游戏统计',items:[{command:'#sgs战绩 排位 / #sgs近期战绩 身份 1',description:'战绩、近期战绩支持中文模式名或 0 至 4'},{command:'#sgs胜率 排位 / #sgs势周瑜胜率排位',description:'按模式查总览或指定武将；群内只查发送者本人'},{command:'#sgs将力 / #sgs能力 / #sgs擅长武将',description:'官方本次返回的本人游戏统计'}]},
  {title:'本人私密资料',items:[{command:'个人资料 / 资产 / 皮肤 / 武将收藏 / 游戏资料',description:'只在本人私聊查询；完整 JSON 导出也仅私聊'}]},
  {title:'登录与保存',items:[{command:'#sgs社区授权',description:'三国咸话 APP 扫码，账号隔离、AES 加密保存'},{command:'官号 / 华为登录',description:'游戏渠道授权协议尚未接通；身份绑定不等于登录'}]},
 ],footer:'统计范围以官方返回为准。未返回不能视为零胜率。无签到、点赞、分享、兑换或领奖功能。'},
};
