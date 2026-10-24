import test from 'node:test';
import assert from 'node:assert/strict';
import {CREATION_SYSTEM,CREATION_REFINE_SYSTEM,CREATION_CONFIRM_SYSTEM} from '../src/creation.js';

const stages=[['generate',CREATION_SYSTEM],['refine',CREATION_REFINE_SYSTEM],['confirm',CREATION_CONFIRM_SYSTEM]];

test('every creation phase preserves the chosen workspace and scoped authorization without asking again',()=>{
 for(const [stage,system] of stages){
  assert.match(system,/沿用[^。\n]*当前工作区[^。\n]*已有授权/,stage);
  assert.match(system,/不[^。\n]*重问[^。\n]*路径[^。\n]*授权/,stage);
  assert.match(system,/真实[^。\n]*权限[^。\n]*不可逆[^。\n]*宿主[^。\n]*审批/,stage);
  assert.match(system,/不[^。\n]*扩大[^。\n]*授权/,stage);
 }
});

test('runtime facts belong to executor verification, never mandatory product clarification',()=>{
 for(const [stage,system] of stages){
  for(const fact of ['cwd','profile','DSH_HOME','宿主版本','工具'])assert.ok(system.includes(fact),`${stage}: ${fact}`);
  assert.match(system,/执行器[^。\n]*Creator[^。\n]*运行时[^。\n]*核实/,stage);
  assert.match(system,/不[^。\n]*用户[^。\n]*提供[^。\n]*父目录绝对路径[^。\n]*profile[^。\n]*DSH_HOME/,stage);
  assert.match(system,/环境[^。\n]*未知[^。\n]*runtime[^。\n]*assumptions[^。\n]*必答/,stage);
  assert.match(system,/不能[^。\n]*臆造[^。\n]*可用/,stage);
 }
});

test('creation workflows describe using the finished plugin rather than its development pipeline',()=>{
 for(const [stage,system] of stages){
  assert.match(system,/blueprint\.workflow[^。\n]*用户[^。\n]*使用插件[^。\n]*动作/,stage);
  assert.match(system,/不[^。\n]*环境确认[^。\n]*开发[^。\n]*构建[^。\n]*安装[^。\n]*使用流程/,stage);
  assert.match(system,/打开计数器[^。\n]*加一或重置[^。\n]*看到数字变化[^。\n]*刷新或重开行为严格遵循原需求/,stage);
  assert.doesNotMatch(system,/打开计数器[^。\n]*已保存的计数/,stage);
 }
});

test('generation and refinement may ask nothing when product behavior is already specified',()=>{
 for(const [stage,system] of stages.slice(0,2)){
  assert.match(system,/questions[^。\n]*\[\][^。\n]*凑[^。\n]*3/,stage);
  assert.match(system,/只[^。\n]*影响[^。\n]*产品[^。\n]*输入输出[^。\n]*歧义/,stage);
 }
});
