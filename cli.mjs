import {SanguoshaMobile} from './api.mjs';
const engine=new SanguoshaMobile();const [cmd,...args]=process.argv.slice(2);
if(cmd==='init')console.log('实例配置已就绪。');
else if(cmd==='command'){
  const result=await engine.handle({owner:args.shift(),privateChat:true,text:args.join(' ')});
  if(result.text)console.log(result.text);
  if(result.file)console.log(result.file.data);
  if(result.image)console.log('社区二维码请在 bot 私聊 #sgs社区授权 获取；CLI不写明文二维码或本人JSON到磁盘。');
}else if(cmd==='diagnose')console.log(JSON.stringify({version:'0.1.0',adapter:engine.config.read().adapter,game:'三国杀移动版',communityQrProtocol:true,officialGameLoginVerified:false,huaweiGameLoginVerified:false,personalDataProtocol:true,accountVerification:'需本人扫码'},null,2));
else console.log('node cli.mjs init | diagnose | command USER "#sgs资讯"');
