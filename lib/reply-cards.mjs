/** The production card path, shared with integration checks. Only public
 * bundled icons are cached; each personal response and its SVG stay in RAM. */
import {buildHelpCard} from './card-views.mjs';
import {createAssetResolver} from './ui-assets.mjs';
import {createNativePortraitResolver,createNativeStaticResolver} from './native-assets.mjs';
import {preparePortraitResolver} from './memory-portraits.mjs';
import {prepareNativeUiAssets} from './native-ui-assets.mjs';
import {buildNativePersonalCards,buildNativePublicCards} from './native-views.mjs';
import {buildNativeRecordCards} from './native-records.mjs';
import {buildNativeCatalogCards} from './native-catalog.mjs';
import {createSkinAssetResolver} from './skin-assets.mjs';
import {NativeCardRenderError} from './native-card-renderer.mjs';

export function createReplyCardBuilder({root,prefix=()=>'#sgs',loadSharp=()=>import('sharp')}={}){
  const publicAssets=createAssetResolver(root);
  const portraits=createNativePortraitResolver({root,assetResolver:publicAssets});
  const staticImages=createNativeStaticResolver({root,assetResolver:publicAssets});
  const skinAssets=createSkinAssetResolver(root);
  const offline=Object.freeze({...publicAssets,
    imageForGeneral:value=>portraits.imageForGeneral(value)??staticImages.imageForGeneral(value),
    imageForOfficialStatic:staticImages.imageForOfficialStatic,
    imageForSkin:skinAssets.imageForSkin});
  let publicIcons;
  return async card=>{
    const options={prefix:typeof prefix==='function'?prefix():prefix,assetResolver:offline,dataAlreadyRedacted:true,...card?.params};
    options.groupShare=card?.share?.scope==='own-gameplay';
    if(card?.result?.kind==='winRate')options.command=(typeof card.params?.general==='string'&&card.params.general?card.params.general+'胜率':'胜率')+' '+(typeof card.params?.gameMode==='string'?card.params.gameMode:'全部');
    if(card?.type==='help')return [buildHelpCard({...options,assetResolver:publicAssets})];
    let cards;
    if(card?.type==='personal'){
      if(card.result?.protocol==='app-qr-v1'&&card.result?.kind==='records')cards=buildNativeRecordCards(card.result,{...options,imageForGeneral:portraits.imageForGeneral});
      else{
        if(card.result?.kind==='assets'){
          publicIcons??=prepareNativeUiAssets({root,assetResolver:publicAssets,loadSharp});
          options.assetResolver={...offline,...await publicIcons};
        }else if(card.result?.kind==='recent')options.assetResolver=await preparePortraitResolver(card.result,offline);
        cards=buildNativePersonalCards(card.result,options);
      }
    }else if(card?.type==='public')cards=['heroCatalog','skinCatalog'].includes(card.result?.kind)?buildNativeCatalogCards(card.result,options):buildNativePublicCards(card.result,options);
    if(!Array.isArray(cards)||!cards.length)throw new NativeCardRenderError('INVALID_NATIVE_CARD');
    return cards;
  };
}
