const DRAG_START_DISTANCE = 8;

function apiCandidates(path) {
  const origin = window.location.origin;
  const candidates = [path];
  const codespaceApiOrigin = origin.replace(/-\d+\.app\.github\.dev$/i, '-3001.app.github.dev');
  if (codespaceApiOrigin !== origin) candidates.push(`${codespaceApiOrigin}${path}`);
  return [...new Set(candidates)];
}

async function patchTask(taskId, payload) {
  const errors = [];
  for (const url of apiCandidates(`/api/life-os/tasks/${taskId}`)) {
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `API ${response.status}`);
      return data;
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

function taskIdFromRow(row) {
  const id = row?.getAttribute('data-reorder-id') || '';
  return id.startsWith('task-') ? id.slice(5) : '';
}

function enhanceEditableNotes() {
  document.querySelectorAll('.inlineTaskDetails:not(.inboxDetails):not([data-edit-ready="true"])').forEach((details) => {
    const row = details.closest('.sideItemRow');
    const taskId = taskIdFromRow(row);
    if (!taskId) return;
    const currentText = details.querySelector('p')?.textContent?.trim() || details.querySelector('textarea')?.value?.trim() || '';
    details.dataset.editReady = 'true';
    details.innerHTML = '';

    const label = document.createElement('label');
    label.className = 'noteEditorLabel';
    label.textContent = 'Заметка / следующий шаг';

    const textarea = document.createElement('textarea');
    textarea.className = 'noteEditor';
    textarea.value = currentText;
    textarea.rows = Math.min(6, Math.max(3, Math.ceil(currentText.length / 80)));

    const actions = document.createElement('div');
    actions.className = 'noteEditorActions';
    const status = document.createElement('span');
    status.className = 'noteSaveStatus';
    status.textContent = '';
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Сохранить заметку';
    save.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      save.disabled = true;
      save.textContent = 'Сохраняю…';
      status.textContent = 'Сохраняю…';
      try {
        await patchTask(taskId, { nextAction: textarea.value.trim() });
        save.textContent = 'Сохранено';
        status.textContent = 'Готово';
        setTimeout(() => { save.textContent = 'Сохранить заметку'; status.textContent = ''; save.disabled = false; }, 1300);
      } catch (error) {
        save.textContent = 'Повторить';
        status.textContent = `Ошибка: ${error.message}`;
        save.disabled = false;
      }
    });

    actions.append(status, save);
    details.append(label, textarea, actions);
  });
}

function linkifyTextElement(element) {
  if (!element || element.dataset.linkified === 'true') return;
  const text = element.textContent || '';
  const urlPattern = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])/gi;
  if (!urlPattern.test(text)) return;

  urlPattern.lastIndex = 0;
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let match;
  while ((match = urlPattern.exec(text)) !== null) {
    if (match.index > lastIndex) fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
    const anchor = document.createElement('a');
    anchor.href = match[0];
    anchor.textContent = match[0];
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.className = 'inboxTextLink';
    fragment.append(anchor);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) fragment.append(document.createTextNode(text.slice(lastIndex)));
  element.textContent = '';
  element.append(fragment);
  element.dataset.linkified = 'true';
}

function enhanceInboxTextLinks() {
  document.querySelectorAll('.inboxFullText:not([data-linkified="true"]), .contextDocCard p:not([data-linkified="true"])').forEach(linkifyTextElement);
}

let dragState = null;
let ghost = null;

function removeGhost() {
  if (ghost) ghost.remove();
  ghost = null;
}

function createGhost(row, x, y) {
  removeGhost();
  ghost = row.cloneNode(true);
  ghost.className = 'lifeDragGhost';
  ghost.removeAttribute('data-reorder-id');
  ghost.querySelectorAll('button').forEach((button) => button.setAttribute('tabindex', '-1'));
  document.body.appendChild(ghost);
  moveGhost(x, y);
}

function moveGhost(x, y) {
  if (!ghost) return;
  ghost.style.left = `${x}px`;
  ghost.style.top = `${y}px`;
}

function beginDragPreview(event) {
  const handle = event.target.closest?.('.dragHandle');
  if (!handle) return;
  const row = handle.closest('.sideItemRow');
  if (!row) return;
  dragState = { row, startX: event.clientX, startY: event.clientY, active: false };
}

function moveDragPreview(event) {
  if (!dragState) return;
  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;
  const distance = Math.hypot(dx, dy);
  if (!dragState.active && distance < DRAG_START_DISTANCE) return;
  if (!dragState.active) {
    dragState.active = true;
    createGhost(dragState.row, event.clientX, event.clientY);
  } else {
    moveGhost(event.clientX, event.clientY);
  }
  event.preventDefault();
}

function endDragPreview() {
  dragState = null;
  removeGhost();
}

function runEnhancements() {
  enhanceEditableNotes();
  enhanceInboxTextLinks();
}

document.addEventListener('pointerdown', beginDragPreview, true);
document.addEventListener('pointermove', moveDragPreview, { capture: true, passive: false });
document.addEventListener('pointerup', endDragPreview, true);
document.addEventListener('pointercancel', endDragPreview, true);

const observer = new MutationObserver(() => runEnhancements());
observer.observe(document.documentElement, { childList: true, subtree: true });
setInterval(runEnhancements, 600);
