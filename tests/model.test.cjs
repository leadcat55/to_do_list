const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');
const task = (id, date, done=false, priority='urgent') => ({id, date, done, priority, text:'Дело '+id});

test('выполнение считается только за выбранный день и приоритет', () => {
  const items=[task('1','2026-10-14',true),task('2','2026-10-14',false,'secondary'),task('3','2026-10-13',true)];
  assert.deepEqual(M.stats(items,'2026-10-14'),{total:2,done:1,percent:50});
  assert.deepEqual(M.stats(items,'2026-10-14','urgent'),{total:1,done:1,percent:100});
  assert.deepEqual(M.stats(items,'2026-10-15'),{total:0,done:0,percent:0});
});
test('даты переходят через границы месяцев, годов и високосного февраля', () => {
  assert.equal(M.shiftDay('2026-12-31',1),'2027-01-01');
  assert.equal(M.shiftDay('2024-03-01',-1),'2024-02-29');
  assert.equal(M.shiftDay('2026-03-01',-1),'2026-02-28');
  assert.equal(M.isDate('2026-02-30'),false);
});
test('приоритеты сортируются раньше менее важных, выполненные уходят вниз', () => {
  const items=[task('a','2026-10-14',false,'later'),task('b','2026-10-14',true),task('c','2026-10-14')];
  assert.deepEqual(M.select(items,'2026-10-14','all').map(x=>x.id),['c','a','b']);
  assert.deepEqual(M.select(items,'2026-10-14','active').map(x=>x.id),['c','a']);
  assert.deepEqual(M.select(items,'2026-10-14','done').map(x=>x.id),['b']);
});
test('резервная копия сохраняет текст и отклоняет повреждённые записи', () => {
  const data={version:1,tasks:[task('1','2026-10-14')]};
  assert.deepEqual(M.parse(JSON.stringify(data)),data);
  for(const value of ['{}','null','{',JSON.stringify({...data,version:2}),JSON.stringify({version:1,tasks:[{...data.tasks[0],date:'2026-02-30'}]}),JSON.stringify({version:1,tasks:[data.tasks[0],data.tasks[0]]}),JSON.stringify({version:1,tasks:[{...data.tasks[0],priority:'unknown'}]}),JSON.stringify({version:1,tasks:[{...data.tasks[0],done:'false'}]})]) assert.throws(()=>M.parse(value));
});
test('пустое название отклоняется, пробелы убираются, длина ограничена', () => {
  assert.equal(M.cleanText('  Купить хлеб  '),'Купить хлеб');
  assert.throws(()=>M.cleanText('   '));
  assert.throws(()=>M.cleanText('я'.repeat(201)));
});