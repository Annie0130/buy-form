import { fillValueParts } from './shared/warranty.js';

export function renderFillValue(parent, value) {
  const parts = fillValueParts(value);
  parent.replaceChildren();
  if (parts.plain) {
    parent.textContent = parts.plain;
    return;
  }
  if (parts.date) {
    const date = document.createElement('span');
    date.className = 'date';
    date.textContent = parts.date;
    parent.append(date);
    if (parts.note) {
      const note = document.createElement('span');
      note.className = 'date-note';
      note.textContent = parts.note;
      parent.append(note);
    }
    return;
  }
  const name = document.createElement('div');
  name.className = 'period-name';
  name.textContent = parts.name;
  const range = document.createElement('div');
  range.className = 'period-range';
  const start = document.createElement('span');
  start.className = 'date';
  start.textContent = parts.start;
  const end = document.createElement('span');
  end.className = 'date';
  end.textContent = `至 ${parts.end}`;
  range.append(start, end);
  parent.append(name, range);
}

export function renderFillRows(container, rows) {
  container.replaceChildren();
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'fill-row';
    const a = document.createElement('div');
    a.className = 'fill-label';
    a.textContent = label;
    const b = document.createElement('div');
    b.className = 'fill-value';
    renderFillValue(b, value);
    row.append(a, b);
    container.append(row);
  }
}
