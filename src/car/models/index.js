// DriveHUD V1.6 — 車模清單（名稱僅為標籤；幾何皆為原創）
import * as valkyrie from './valkyrie.js';
import * as darkknight from './darkknight.js';
import * as asurada from './asurada.js';

export const MODELS = [
  { id: 'valkyrie', displayName: '女武神', build: valkyrie.build },
  { id: 'darkknight', displayName: '黑暗騎士', build: darkknight.build },
  { id: 'asurada', displayName: '阿斯拉', build: asurada.build },
];

export function getModel(id) {
  return MODELS.find((m) => m.id === id) || MODELS[0];
}
