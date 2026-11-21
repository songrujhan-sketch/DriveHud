import * as motorcycle from './motorcycle.js';
import * as carriage from './carriage.js';
import * as family from './family.js';
import * as daystar from './daystar.js';
// DriveHUD V1.6 — 車模清單（名稱僅為標籤；幾何皆為原創）
import * as valkyrie from './valkyrie.js';
import * as darkknight from './darkknight.js';
import * as asurada from './asurada.js';
import * as rover from './rover.js';

import * as tumbler from './tumbler.js';

export const MODELS = [
  { id: 'valkyrie', displayName: '女武神', build: valkyrie.build },
  { id: 'darkknight', displayName: '黑騎士', build: darkknight.build },
  { id: 'asurada', displayName: '阿斯拉', build: asurada.build },
  { id: 'rover', displayName: '豹勇士', build: rover.build },
  { id: 'tumbler', displayName: '重騎兵', build: tumbler.build },
  { id: 'daystar', displayName: '明日之星', build: daystar.build },
  {id:'carriage',displayName:'馬車',build:carriage.build},
  {id:'family',displayName:'好爸爸',build:family.build},
  { id: 'motorcycle', displayName: '重型機車', build: motorcycle.build },
];

export function getModel(id) {
  return MODELS.find((m) => m.id === id) || MODELS[0];
}
