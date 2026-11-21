import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estimateTurn} from '../../src/car/turn.js';
test('GPS course wraps through north and distinguishes turn direction',()=>{
 const fix=(t,heading)=>({t,heading,speed:6});
 assert.ok(estimateTurn(fix(0,350),fix(1000,5))<0);
 assert.ok(estimateTurn(fix(0,5),fix(1000,350))>0);
 assert.equal(estimateTurn(fix(0,0),fix(1000,1)),0);
 assert.equal(estimateTurn(fix(0,0),fix(6000,20)),0);
 assert.equal(estimateTurn(fix(0,0),{t:1000,heading:20,speed:.3}),0);
});
