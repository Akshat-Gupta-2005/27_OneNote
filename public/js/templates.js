// Two kinds of template:
//  - PAGE templates ("Add page ▾"): build() returns the POST /api/pages payload
//    { title, content: JSON string, text }, so a structured page is created complete in one request.
//  - INSERT templates (Insert → Templates): build() returns { title, blocks }, note containers that
//    are added to the page you're on, below what is already there.
import { emptyTodo, todoPlainText } from './todo.js';
import { emptyBoard, boardPlainText } from './board.js';
import { emptyTab, tabPlainText } from './tab.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

const longDate = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const dayName = (d) => d.toLocaleDateString(undefined, { weekday: 'long' });
const time = (d) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const todoLine = (text = '') => `<div data-tag="todo" data-checked="false">${text || '<br>'}</div>`;
const prompt = (text) => `<div><i>${text}</i></div>`;
const table = (head, rows) => `<table><tbody><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr>${
  Array.from({ length: rows }, () => `<tr>${head.map(() => '<td><br></td>').join('')}</tr>`).join('')}</tbody></table><div><br></div>`;

function canvas(title, blocks) {
  return { title, blocks: blocks.map((b) => ({ id: uid(), w: null, ...b })) };
}

export const PAGE_TEMPLATES = [
  {
    id: 'blank', name: 'Blank page', icon: 'plus', hint: 'Freeform',
    build: () => ({ title: '', content: '', text: '' }),
  },
  {
    id: 'todo', name: 'To-do planner', icon: 'todo', hint: 'Month · date · tag views',
    build: (now = new Date()) => {
      const data = emptyTodo(now);
      return { title: 'To-do planner', content: JSON.stringify(data), text: todoPlainText(data) };
    },
  },
  {
    id: 'cards', name: 'Cards', icon: 'board', hint: 'Lists of cards, like a board',
    build: () => {
      const data = emptyBoard();
      return { title: 'Cards', content: JSON.stringify(data), text: boardPlainText(data) };
    },
  },
  {
    id: 'tab', name: 'Tab', icon: 'wallet', hint: 'Money with people: who owes whom',
    build: () => {
      const data = emptyTab();
      return { title: 'Tab', content: JSON.stringify(data), text: tabPlainText(data) };
    },
  },
];

export const INSERT_TEMPLATES = [
  {
    id: 'meeting', name: 'Meeting notes', icon: 'contact', hint: 'Agenda · action items',
    build: (now = new Date()) => canvas(`Meeting — ${longDate(now)}`, [{
      x: 60, y: 100, w: 560,
      html: [
        '<h2>Details</h2>',
        `<div><b>When:</b> ${longDate(now)}, ${time(now)}</div>`,
        '<div><b>Where / link:</b> </div>',
        '<div><b>Attendees:</b> </div>',
        '<h2>Agenda</h2><ol><li><br></li><li><br></li><li><br></li></ol>',
        '<h2>Notes</h2><div><br></div>',
        '<h2>Decisions</h2><ul><li><br></li></ul>',
        '<h2>Action items</h2>',
        todoLine(), todoLine(),
      ].join(''),
    }]),
  },
  {
    id: 'journal', name: 'Daily journal', icon: 'calendar', hint: 'Priorities · notes · reflection',
    build: (now = new Date()) => canvas(`Journal — ${dayName(now)}, ${longDate(now)}`, [
      {
        x: 60, y: 100, w: 360,
        html: `<h2>Top 3 today</h2>${todoLine()}${todoLine()}${todoLine()}<h2>Schedule</h2>${table(['Time', 'What'], 4)}`,
      },
      {
        x: 460, y: 100, w: 380,
        html: `<h2>Notes</h2><div><br></div><h2>Grateful for</h2><ul><li><br></li></ul><h2>Reflection</h2>${prompt('What went well? What would I do differently tomorrow?')}`,
      },
    ]),
  },
  {
    id: 'project', name: 'Project plan', icon: 'table', hint: 'Goal · milestones · risks',
    build: () => canvas('Project plan', [{
      x: 60, y: 100, w: 620,
      html: [
        `<h2>Goal</h2>${prompt('One sentence: what does done look like, and for whom?')}`,
        `<h2>Milestones</h2>${table(['Milestone', 'Due', 'Status'], 3)}`,
        '<h2>Risks</h2><ul><li><i>Risk → what I will do about it</i></li></ul>',
        `<h2>Next steps</h2>${todoLine()}${todoLine()}${todoLine()}`,
        '<h2>Links</h2><div><br></div>',
      ].join(''),
    }]),
  },
  {
    id: 'weekly', name: 'Weekly planner', icon: 'grid', hint: 'Seven day boxes',
    build: (now = new Date()) => {
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
      const blocks = DAYS.map((name, i) => {
        const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
        return {
          x: 60 + (i % 4) * 250, y: i < 4 ? 100 : 330, w: 230,
          html: `<h3>${name} ${d.getDate()}</h3>${todoLine()}${todoLine()}`,
        };
      });
      blocks.push({ x: 60 + 3 * 250, y: 330, w: 230, html: '<h3>Notes</h3><div><br></div>' });
      return canvas(`Week of ${longDate(monday)}`, blocks);
    },
  },
];

export const findTemplate = (id) => PAGE_TEMPLATES.find((t) => t.id === id);
export const findInsertTemplate = (id) => INSERT_TEMPLATES.find((t) => t.id === id);
