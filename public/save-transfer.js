import {SLOT_KEYS,LEGACY_KEY,OPTIONS_KEY,exportBackup,parseBackup,saveCandidates,validateSave,importEmptySlot} from './save-transfer-core.js';
const $ = id => document.getElementById(id);
if(window.top === window.self){$('new-site').href='https://torika-flower-sfc.earthkey.workers.dev/save-transfer.html';$('new-site').textContent='新しいゲームの引っ越し画面へ';}
else{const parentSite=location.hostname==='torika-flower-sfc.vercel.app'?'https://torika-flower-site.vercel.app/':'https://torika-flower-site.earthkey.workers.dev/';$('game').href=parentSite+'?save-transfer=0#play';$('game').target='_top';}
let backup = null;
const status = text => { $('status').textContent = text; };
function refresh() {
  const used = SLOT_KEYS.map((k,i) => localStorage.getItem(k) !== null || (i===0 && localStorage.getItem(LEGACY_KEY)!==null));
  $('current').textContent = used.map((x,i)=>`スロット${i+1}: ${x?'データあり':'空き'}`).join(' ／ ');
  $('target').replaceChildren(...used.map((x,i)=>{const o=new Option(`スロット${i+1}${x?'（データあり・選択不可）':'（空き）'}`,String(i+1));o.disabled=x;return o;}));
  const first=used.findIndex(x=>!x); $('target').value=first<0?'':String(first+1);
  $('import').disabled=first<0 || !backup || saveCandidates(backup).length===0;
  $('options').disabled=localStorage.getItem(OPTIONS_KEY)!==null || !backup?.entries[OPTIONS_KEY];
  if($('options').disabled) $('options').checked=false;
}
function preview() {
  if(!backup || !$('source').value){$('preview').textContent='取り込めるセーブがありません。';return;}
  const d=validateSave(backup.entries[$('source').value]);
  const sum=x=>Object.values(x??{}).reduce((a,b)=>a+b,0);
  $('preview').textContent=`種 ${sum(d.seeds)} ／ メダル ${sum(d.medals)} ／ 季節の解放 ${Object.entries(d.stageUnlocks??{}).filter(([,v])=>v).length}件。書き出した元データをそのまま取り込みます。`;
}
$('export').addEventListener('click',()=>{try{
  const text=exportBackup(localStorage,location.origin);
  const entries=JSON.parse(text).entries;
  if(Object.keys(entries).length===0){status('この保存場所にはデータがありません。いつも遊んでいたブラウザ・埋め込みの画面で開いてください。');return;}
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`torikka-flower-save-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  status('JSONの保存を開始しました。ダウンロード先を確認してください。元のセーブは変更していません。');
}catch{status('このブラウザではデータを読み出せませんでした。元のデータは変更していません。');}});
$('file').addEventListener('change',async()=>{backup=null;$('import-fields').hidden=true;try{
  const file=$('file').files[0];if(!file)return;if(file.size>1000000)throw Error('最大1MBのJSONを選んでください。');
  backup=parseBackup(await file.text());
  $('source').replaceChildren(...saveCandidates(backup).map(x=>new Option(x.label,x.key)));
  $('import-fields').hidden=false;refresh();preview();status('ファイルを確認しました。まだ取り込んでいません。');
}catch(e){status(`取り込みできません: ${e.message}`);refresh();}});
$('source').addEventListener('change',preview);
$('import').addEventListener('click',()=>{try{
  const n=importEmptySlot(localStorage,backup,$('source').value,Number($('target').value),$('options').checked);
  refresh();status(`スロット${n}へ保存しました。ゲームに戻り「つづきから」で確認してください。ほかのスロットは変更していません。`);
}catch(e){status(`取り込みできません: ${e.message}`);refresh();}});
window.addEventListener('storage',refresh);
try{refresh();}catch{status('ブラウザの保存領域を利用できません。プライベートモードや保存制限を確認してください。');$('export').disabled=true;$('file').disabled=true;}
