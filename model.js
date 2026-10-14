(function (root) {
  'use strict';
  const priorities = { urgent: 'Срочно', secondary: 'Второстепенно', later: 'Можно сделать потом' };
  function isDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
    const date = new Date(value + 'T12:00:00Z');
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }
  function today() {
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function shiftDay(value, offset) {
    if (!isDate(value)) throw new Error('Выбери корректную дату.');
    const date = new Date(value + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + offset);
    if (date.getUTCFullYear() < 1) return '0001-01-01';
    if (date.getUTCFullYear() > 9999) return '9999-12-31';
    return date.toISOString().slice(0, 10);
  }
  function cleanText(value) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Напиши название задачи.');
    const text = value.trim();
    if (text.length > 200) throw new Error('Название должно быть не длиннее 200 символов.');
    return text;
  }
  function stats(tasks, day, priority) {
    const selected = tasks.filter(task => task.date === day && (!priority || task.priority === priority));
    const done = selected.filter(task => task.done).length;
    return { total: selected.length, done, percent: selected.length ? Math.round(done / selected.length * 100) : 0 };
  }
  function select(tasks, day, filter = 'all') {
    const order = Object.keys(priorities);
    return tasks.filter(task => task.date === day && (filter === 'all' || (filter === 'done' ? task.done : !task.done)))
      .sort((a, b) => Number(a.done) - Number(b.done) || order.indexOf(a.priority) - order.indexOf(b.priority));
  }
  function parse(raw) {
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.tasks) || data.tasks.length > 50000) throw new Error('Неподдерживаемый формат резервной копии.');
    const ids = new Set();
    const tasks = data.tasks.map(task => {
      if (!task || typeof task.id !== 'string' || !task.id || task.id.length > 100 || ids.has(task.id) || !isDate(task.date) || !Object.hasOwn(priorities, task.priority) || typeof task.done !== 'boolean') throw new Error('В файле есть повреждённая задача.');
      ids.add(task.id);
      return { id: task.id, date: task.date, done: task.done, priority: task.priority, text: cleanText(task.text) };
    });
    return { version: 1, tasks };
  }
  const api = { priorities, isDate, today, shiftDay, cleanText, stats, select, parse };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Planner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);