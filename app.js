(() => {
  'use strict';
  const M = window.Planner;
  const $ = id => document.getElementById(id);
  const KEY = 'goodwin.todo.v1';
  let data = { version: 1, tasks: [] };
  let day = M.today();
  let filter = 'all';
  let editing = null;
  let undoTask = null;
  let toastTimer;
  let storageBlocked = false;
  let storedRaw = null;
  const fullDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shortDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', timeZone: 'UTC' });
  const shortWeekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' });
  const asDate = value => new Date(value + 'T12:00:00Z');
  const colors = { urgent: '#e76c48', secondary: '#c3a35d', later: '#8d89ae' };
  const icons = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15z"/></svg>',
    delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>'
  };
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function warn(message) {
    $('storage-warning').textContent = message;
    $('storage-warning').hidden = !message;
    document.querySelector('.local-indicator').lastChild.textContent = message ? ' Есть проблема с сохранением' : ' Сохранено в браузере';
  }
  function notify(message, canUndo = false) {
    clearTimeout(toastTimer);
    $('toast-text').textContent = message;
    $('undo').hidden = !canUndo;
    if (!canUndo) undoTask = null;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; undoTask = null; }, canUndo ? 12000 : 6000);
  }
  function readStorage() {
    try {
      storedRaw = localStorage.getItem(KEY);
      data = storedRaw === null ? { version: 1, tasks: [] } : M.parse(storedRaw);
      storageBlocked = false;
      warn('');
    } catch (error) {
      storageBlocked = true;
      warn('Не удалось прочитать сохранённые задачи. Чтобы не затереть данные, изменения остановлены. Экспортируй исходные данные для восстановления или импортируй исправную резервную копию. Проверь также разрешение браузера на хранение данных.');
    }
  }
  function save(next, recovering = false) {
    if (storageBlocked && !recovering) { notify('Сначала восстанови данные из резервной копии или разреши хранение в браузере.'); return false; }
    try {
      const raw = JSON.stringify(next);
      localStorage.setItem(KEY, raw);
      data = next;
      storedRaw = raw;
      storageBlocked = false;
      warn('');
      const focusId = document.activeElement?.id;
      render();
      if (focusId) document.getElementById(focusId)?.focus();
      return true;
    } catch (error) {
      warn('Браузер не смог сохранить изменения. Последнее действие не применено. Проверь свободное место и разрешение на хранение данных; сделай экспорт для резервной копии.');
      notify('Изменение не сохранено.');
      return false;
    }
  }
  function updateTask(id, changes) {
    return save({ version: 1, tasks: data.tasks.map(task => task.id === id ? { ...task, ...changes } : task) });
  }
  function setDay(value) {
    if (!M.isDate(value)) { $('selected-date').value = day; notify('Выбери корректную дату.'); return; }
    day = value;
    render();
  }
  function setRing(node, percent, label) {
    node.style.setProperty('--value', percent);
    node.setAttribute('aria-valuenow', percent);
    node.setAttribute('aria-valuetext', label);
  }
  function renderTasks() {
    const tasks = M.select(data.tasks, day, filter);
    const s = M.stats(data.tasks, day);
    $('task-count').textContent = s.total;
    $('all-count').textContent = s.total;
    $('active-count').textContent = s.total - s.done;
    $('done-count').textContent = s.done;
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
    const nodes = tasks.map(task => {
      const row = element('li', 'task-row' + (task.done ? ' is-done' : ''));
      row.dataset.id = task.id;
      const check = element('input', 'task-check');
      check.type = 'checkbox';
      check.checked = task.done;
      check.id = 'task-' + task.id;
      check.setAttribute('aria-label', (task.done ? 'Вернуть в работу: ' : 'Выполнить: ') + task.text);
      check.addEventListener('change', () => {
        if (!updateTask(task.id, { done: check.checked })) check.checked = task.done;
      });
      const body = element('div', 'task-body');
      const title = element('label', 'task-title', task.text);
      title.htmlFor = check.id;
      const meta = element('div', 'task-meta priority-' + task.priority);
      meta.append(element('span', 'priority-dot'), document.createTextNode(M.priorities[task.priority]));
      body.append(title, meta);
      const actions = element('div', 'row-actions');
      for (const action of ['edit', 'delete']) {
        const button = element('button', 'row-action ' + action + '-button');
        button.type = 'button';
        button.innerHTML = icons[action];
        button.setAttribute('aria-label', (action === 'edit' ? 'Изменить: ' : 'Удалить: ') + task.text);
        button.title = action === 'edit' ? 'Изменить задачу' : 'Удалить задачу';
        button.addEventListener('click', () => {
          if (action === 'edit') {
            editing = task.id;
            $('edit-text').value = task.text;
            $('edit-priority').value = task.priority;
            $('edit-dialog').showModal();
            $('edit-text').focus();
          } else {
            const index = data.tasks.findIndex(item => item.id === task.id);
            if (save({ version: 1, tasks: data.tasks.filter(item => item.id !== task.id) })) {
              undoTask = { task, index };
              notify('Задача удалена', true);
            }
          }
        });
        actions.append(button);
      }
      row.append(check, body, actions);
      return row;
    });
    $('task-list').replaceChildren(...nodes);
    $('empty-state').hidden = tasks.length !== 0;
    if (s.total === 0) {
      $('empty-title').textContent = 'Чистый лист для твоих планов';
      $('empty-text').textContent = 'Добавь первое дело. Даже маленький шаг — уже движение вперёд.';
    } else if (filter === 'active') {
      $('empty-title').textContent = 'Все дела выполнены!';
      $('empty-text').textContent = 'Можно выдохнуть и порадоваться результату.';
    } else {
      $('empty-title').textContent = 'Здесь появятся завершённые дела';
      $('empty-text').textContent = 'Отметь выполненную задачу — и увидишь свой прогресс.';
    }
    $('task-footer-text').textContent = s.total === 0 ? 'Все дела начинаются с одной записи' : s.done === s.total ? 'План на этот день выполнен. Хорошая работа!' : `Выполнено ${s.done} из ${s.total} · осталось ${s.total - s.done}`;
  }
  function renderProgress() {
    const s = M.stats(data.tasks, day);
    $('progress-percent').replaceChildren(document.createTextNode(s.percent), element('span', '', '%'));
    setRing($('main-ring'), s.percent, `Выполнено ${s.done} из ${s.total}, ${s.percent}%`);
    $('progress-message').textContent = !s.total ? 'Всё начинается с плана' : s.done === s.total ? 'Ты справился. Все дела готовы!' : s.done === 0 ? 'Первый шаг — за тобой' : s.percent < 50 ? 'Начало положено!' : 'Хороший темп. Продолжай!';
    $('progress-detail').textContent = !s.total ? 'Добавь задачи на этот день' : `Выполнено ${s.done} из ${s.total} запланированных дел`;
    $('priority-progress').replaceChildren(...Object.entries(M.priorities).map(([key, title]) => {
      const stats = M.stats(data.tasks, day, key);
      const line = element('div', 'priority-line');
      const ring = element('div', 'ring mini-ring');
      ring.style.setProperty('--ring-color', colors[key]);
      ring.setAttribute('role', 'progressbar');
      ring.setAttribute('aria-label', title);
      ring.setAttribute('aria-valuemin', 0);
      ring.setAttribute('aria-valuemax', 100);
      setRing(ring, stats.percent, `${stats.done} из ${stats.total}`);
      line.append(ring, element('span', 'priority-label', title), element('span', 'priority-fraction', `${stats.done} / ${stats.total}`));
      return line;
    }));
  }
  function renderWeek() {
    const days = [...new Set(Array.from({ length: 7 }, (_, index) => M.shiftDay(day, index - 6)))];
    let total = 0;
    let done = 0;
    $('week-days').replaceChildren(...days.map(value => {
      const s = M.stats(data.tasks, value);
      total += s.total;
      done += s.done;
      const button = element('button', 'week-day');
      button.type = 'button';
      button.setAttribute('aria-label', `${fullDate.format(asDate(value))}: выполнено ${s.done} из ${s.total}`);
      button.setAttribute('aria-pressed', String(value === day));
      button.title = `${shortDate.format(asDate(value))} · ${s.percent}%`;
      const ring = element('div', 'ring');
      ring.style.setProperty('--value', s.percent);
      ring.append(element('span', '', Number(value.slice(8))));
      button.append(element('small', '', shortWeekday.format(asDate(value))), ring, element('span', 'day-fraction', s.total ? `${s.done} / ${s.total}` : '—'));
      button.addEventListener('click', () => setDay(value));
      return button;
    }));
    $('week-total').textContent = `${done} / ${total} дел`;
  }
  function render() {
    $('selected-date').value = day;
    const date = asDate(day);
    $('day-title').textContent = day === M.today() ? 'Сегодня, ' + shortDate.format(date) : shortDate.format(date);
    $('day-subtitle').textContent = weekday.format(date) + ' · ' + day.slice(0, 4);
    $('today').disabled = day === M.today();
    $('prev-day').disabled = day === '0001-01-01';
    $('next-day').disabled = day === '9999-12-31';
    renderTasks(); renderProgress(); renderWeek();
  }
  $('add-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const text = M.cleanText($('task-text').value);
      const priority = $('task-priority').value;
      if (!Object.hasOwn(M.priorities, priority)) throw new Error('Выбери приоритет.');
      const id = window.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
      const task = { id, text, priority, date: day, done: false };
      if (save({ version: 1, tasks: [...data.tasks, task] })) {
        $('task-text').value = '';
        filter = 'all';
        renderTasks();
        $('task-text').focus();
        notify('Задача добавлена');
      }
    } catch (error) { notify(error.message); }
  });
  $('edit-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const text = M.cleanText($('edit-text').value);
      const priority = $('edit-priority').value;
      if (!Object.hasOwn(M.priorities, priority)) throw new Error('Выбери приоритет.');
      if (!data.tasks.some(task => task.id === editing)) throw new Error('Эта задача уже удалена.');
      if (updateTask(editing, { text, priority })) { $('edit-dialog').close(); notify('Задача изменена'); }
    } catch (error) { notify(error.message); }
  });
  ['close-edit', 'cancel-edit'].forEach(id => $(id).addEventListener('click', () => $('edit-dialog').close()));
  $('prev-day').addEventListener('click', () => setDay(M.shiftDay(day, -1)));
  $('next-day').addEventListener('click', () => setDay(M.shiftDay(day, 1)));
  $('today').addEventListener('click', () => setDay(M.today()));
  $('selected-date').addEventListener('change', event => setDay(event.target.value));
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter; renderTasks(); }));
  $('undo').addEventListener('click', () => {
    if (!undoTask) return;
    const { task, index } = undoTask;
    if (data.tasks.some(item => item.id === task.id)) { notify('Задача уже восстановлена.'); return; }
    const tasks = [...data.tasks];
    tasks.splice(Math.min(index, tasks.length), 0, task);
    if (save({ version: 1, tasks })) notify('Задача восстановлена');
  });
  $('close-toast').addEventListener('click', () => { $('toast').hidden = true; clearTimeout(toastTimer); undoTask = null; });
  $('export').addEventListener('click', () => {
    try {
      const content = storageBlocked && storedRaw !== null ? storedRaw : JSON.stringify(data, null, 2);
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
      const link = element('a');
      link.href = url;
      link.download = `my-day-${M.today()}${storageBlocked ? '-recovery' : ''}.json`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Резервная копия передана браузеру для скачивания.');
    } catch (error) { notify('Не удалось подготовить экспорт.'); }
  });
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error('Файл слишком большой. Максимум — 12 МБ.');
      const imported = M.parse(await file.text());
      if (!window.confirm(`Импортировать ${imported.tasks.length} задач? Текущий список за все дни будет заменён. Перед заменой сохрани его через «Экспорт».`)) return;
      if (save(imported, true)) { undoTask = null; notify('Резервная копия загружена'); }
    } catch (error) { notify('Импорт не выполнен: ' + error.message); }
    finally { event.target.value = ''; }
  });
  window.addEventListener('storage', event => {
    if (event.key === KEY || event.key === null) { readStorage(); undoTask = null; render(); }
  });
  window.addEventListener('focus', () => { render(); });
  readStorage();
  render();
})();