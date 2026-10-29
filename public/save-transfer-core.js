export const SLOT_KEYS = [1, 2, 3].map(n => `torikka-flower-save-slot${n}`);
export const LEGACY_KEY = 'torikka-flower-save-v1';
export const OPTIONS_KEY = 'torikka-flower-options-v1';
const ALLOWED = [...SLOT_KEYS, LEGACY_KEY, OPTIONS_KEY];
const FORMAT = 'torikka-flower-save-backup';
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
function safeTree(x, depth = 0) {
  if (depth > 12) throw Error('データの構造が深すぎます。');
  if (typeof x === 'number' && !Number.isFinite(x)) throw Error('数値が正しくありません。');
  if (x && typeof x === 'object') {
    for (const [key, value] of Object.entries(x)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('許可されていない項目があります。');
      safeTree(value, depth + 1);
    }
  }
}
export function validateSave(raw) {
  if (typeof raw !== 'string' || raw.length > 200000) throw Error('セーブのサイズが正しくありません。');
  const data = JSON.parse(raw);
  if (!object(data) || !object(data.seeds) || !object(data.medals) || !object(data.plots)) throw Error('トリッカフラワーのセーブとして確認できません。');
  safeTree(data);
  for (const values of [data.seeds, data.medals, data.kusuriCounts ?? {}]) {
    if (!object(values) || !Object.values(values).every(n => Number.isFinite(n) && n >= 0)) throw Error('所持数が正しくありません。');
  }
  if (data.stageUnlocks && (!object(data.stageUnlocks) || !Object.values(data.stageUnlocks).every(x => typeof x === 'boolean'))) throw Error('季節の記録が正しくありません。');
  const count = n => Number.isFinite(n) && n >= 0;
  const record = (x, test) => object(x) && Object.values(x).every(test);
  for (const k of ['kusuriEverObtained','urabanashiSeen','specialSeen','hengeSeen']) if (k in data && !record(data[k], x=>typeof x==='boolean')) throw Error('既読の記録が正しくありません。');
  for (const k of ['npcCrossTalk','questDeliveredAt']) if (k in data && !record(data[k], count)) throw Error('進行の記録が正しくありません。');
  for (const k of ['kusuri','totalKusuriCrafted','lastPlayedMs']) if (k in data && !count(data[k])) throw Error('進行の数値が正しくありません。');
  for (const k of ['hasKanbakutaisouto','finaleCutinSeen','finaleSeen']) if (k in data && typeof data[k]!=='boolean') throw Error('進行の記録が正しくありません。');
  if (!record(data.plots, p=>object(p) && typeof p.crop==='string' && (p.plantedAtMs===null || count(p.plantedAtMs)))) throw Error('畑の記録が正しくありません。');
  if ('seedSpotCollectedAt' in data && !record(data.seedSpotCollectedAt, n=>n===null || count(n))) throw Error('採取の記録が正しくありません。');
  if ('npcStates' in data && !record(data.npcStates, n=>object(n) && count(n.trust) && count(n.talkCount) && (!('trustGainedOn' in n) || n.trustGainedOn===null || typeof n.trustGainedOn==='string'))) throw Error('会話の記録が正しくありません。');
  return data;
}
function validateOptions(raw) {
  if (typeof raw !== 'string' || raw.length > 20000) throw Error('設定のサイズが正しくありません。');
  const d = JSON.parse(raw); safeTree(d);
  if (!object(d)) throw Error('設定が正しくありません。');
  if ('typeSpeed' in d && !['slow','normal','fast'].includes(d.typeSpeed)) throw Error('文字速度が正しくありません。');
  if ('zoomDefault' in d && typeof d.zoomDefault !== 'boolean') throw Error('表示設定が正しくありません。');
  for (const k of ['masterVolume','bgmVolume','seVolume']) if (k in d && !(typeof d[k] === 'number' && d[k] >= 0 && d[k] <= 1)) throw Error('音量設定が正しくありません。');
}
export function exportBackup(storage, origin) {
  const entries = {};
  for (const key of ALLOWED) { const raw = storage.getItem(key); if (raw !== null) entries[key] = raw; }
  // Raw values are preserved, including a damaged save, so an export never destroys evidence.
  return JSON.stringify({format:FORMAT, version:1, exportedAt:new Date().toISOString(), origin, entries}, null, 2);
}
export function parseBackup(text) {
  if (typeof text !== 'string' || text.length > 1000000) throw Error('ファイルが大きすぎます（最大1MB）。');
  const b = JSON.parse(text);
  if (!object(b) || b.format !== FORMAT || b.version !== 1 || !object(b.entries)) throw Error('この引っ越し画面で書き出したJSONを選んでください。');
  safeTree(b);
  for (const [key, raw] of Object.entries(b.entries)) {
    if (!ALLOWED.includes(key)) throw Error('別のアプリの項目が含まれています。');
    if (key === OPTIONS_KEY) validateOptions(raw); else validateSave(raw);
  }
  return b;
}
export function saveCandidates(b) {
  const list = SLOT_KEYS.filter(k => k in b.entries).map((key, i) => ({key, label:`スロット${SLOT_KEYS.indexOf(key)+1}`}));
  if (LEGACY_KEY in b.entries) list.push({key:LEGACY_KEY,label:'旧形式のセーブ'});
  return list;
}
export function importEmptySlot(storage, backup, sourceKey, targetSlot, includeOptions = false) {
  // Revalidate and check occupancy immediately before any write, including other-tab changes.
  const b = parseBackup(JSON.stringify(backup));
  if (![1,2,3].includes(targetSlot) || !saveCandidates(b).some(x => x.key === sourceKey)) throw Error('スロットを選んでください。');
  const targetKey = SLOT_KEYS[targetSlot-1];
  if (storage.getItem(targetKey) !== null || (targetSlot === 1 && storage.getItem(LEGACY_KEY) !== null)) throw Error('このスロットには既にデータがあります。別の空きスロットを選んでください。');
  const entries = [[targetKey,b.entries[sourceKey]]];
  if (includeOptions && b.entries[OPTIONS_KEY]) {
    if (storage.getItem(OPTIONS_KEY) !== null) throw Error('設定は既にあります。設定のチェックを外してください。');
    entries.push([OPTIONS_KEY,b.entries[OPTIONS_KEY]]);
  }
  const written = [];
  try {
    for (const [key,raw] of entries) {
      if (storage.getItem(key) !== null) throw Error('別の画面でデータが更新されました。取り込みを中止しました。');
      storage.setItem(key,raw); written.push([key,raw]);
      if (storage.getItem(key) !== raw) throw Error('ブラウザに保存できませんでした。');
    }
  } catch (e) {
    // Roll back only keys written by this transaction, never an older or concurrently changed value.
    for (const [key,raw] of written.reverse()) if (storage.getItem(key) === raw) storage.removeItem(key);
    throw e;
  }
  return targetSlot;
}
