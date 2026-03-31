// ─── Firebase config — replace with your project's values ───────────────────
 const firebaseConfig = {
    apiKey: "AIzaSyCq8D1pLUeoCvBPCMnO8IxnXaB4gfsZRcI",
    authDomain: "tsk1-5fa23.firebaseapp.com",
    projectId: "tsk1-5fa23",
    storageBucket: "tsk1-5fa23.firebasestorage.app",
    messagingSenderId: "741817934400",
    appId: "1:741817934400:web:0c1d9f60a3b34422ae75a5"
  };

// ─────────────────────────────────────────────────────────────────────────────

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let currentUser = null;
let tasks = [];
let activeFilter = 'all';
let editingId = null;
let unsubscribe = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingEl     = document.getElementById('loading');
const authScreen    = document.getElementById('auth-screen');
const appEl         = document.getElementById('app');
const taskList      = document.getElementById('task-list');
const modalOverlay  = document.getElementById('modal-overlay');
const taskForm      = document.getElementById('task-form');
const titleInput    = document.getElementById('input-title');
const dateInput     = document.getElementById('input-date');
const modalTitle    = document.getElementById('modal-title');
const userAvatar    = document.getElementById('user-avatar');

// ── Auth ──────────────────────────────────────────────────────────────────────
document.getElementById('btn-google-signin').addEventListener('click', () => {
  auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
});

document.getElementById('btn-signout').addEventListener('click', () => {
  if (unsubscribe) unsubscribe();
  auth.signOut();
});

auth.onAuthStateChanged(user => {
  loadingEl.style.display = 'none';
  if (user) {
    currentUser = user;
    userAvatar.src = user.photoURL || '';
    userAvatar.style.display = user.photoURL ? 'block' : 'none';
    authScreen.style.display = 'none';
    appEl.style.display = 'block';
    subscribeToTasks();
  } else {
    currentUser = null;
    if (unsubscribe) unsubscribe();
    appEl.style.display = 'none';
    authScreen.style.display = 'flex';
  }
});

// ── Firestore ─────────────────────────────────────────────────────────────────
function tasksRef() {
  return db.collection('users').doc(currentUser.uid).collection('tasks');
}

function subscribeToTasks() {
  if (unsubscribe) unsubscribe();
  unsubscribe = tasksRef()
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTasks();
    });
}

async function addTask(data) {
  await tasksRef().add({ ...data, done: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
}

async function updateTask(id, data) {
  await tasksRef().doc(id).update(data);
}

async function deleteTask(id) {
  await tasksRef().doc(id).delete();
}

async function toggleDone(id, current) {
  await updateTask(id, { done: !current });
}

// ── Filters ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTasks();
  });
});

function applyFilter(list) {
  const today = todayStr();
  switch (activeFilter) {
    case 'active':   return list.filter(t => !t.done);
    case 'done':     return list.filter(t => t.done);
    case 'high':     return list.filter(t => t.priority === 'high' && !t.done);
    case 'overdue':  return list.filter(t => !t.done && t.dueDate && t.dueDate < today);
    default:         return list;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-');
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dueMeta(dueDate) {
  if (!dueDate) return '';
  const today = todayStr();
  let cls = 'due-badge';
  let label = formatDate(dueDate);
  if (dueDate < today) cls += ' overdue';
  else if (dueDate === today) { cls += ' today'; label = 'Today'; }
  return `<span class="${cls}">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
    ${label}
  </span>`;
}

function priorityLabel(p) {
  return { high: 'High', med: 'Medium', low: 'Low' }[p] || '';
}

function renderTasks() {
  const filtered = applyFilter(tasks);

  // Sort: undone first, then by priority (high > med > low), then due date
  const order = { high: 0, med: 1, low: 2 };
  filtered.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const pd = (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
    if (pd !== 0) return pd;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  if (filtered.length === 0) {
    taskList.innerHTML = `<div class="empty-state">No tasks here.</div>`;
    return;
  }

  taskList.innerHTML = filtered.map(t => `
    <div class="task-card ${t.done ? 'done' : ''}" data-id="${t.id}">
      <button class="check-btn" data-id="${t.id}" data-done="${t.done}" title="Toggle complete">
        ${t.done ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </button>
      <div class="task-body">
        <div class="task-title">${escHtml(t.title)}</div>
        <div class="task-meta">
          ${t.priority ? `<span class="priority-label priority-${t.priority}">${priorityLabel(t.priority)}</span>` : ''}
          ${dueMeta(t.dueDate)}
        </div>
      </div>
      <div class="task-actions">
        <button class="btn-icon edit-btn" data-id="${t.id}" title="Edit">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon delete-btn" data-id="${t.id}" title="Delete">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  // Events
  taskList.querySelectorAll('.check-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleDone(btn.dataset.id, btn.dataset.done === 'true'));
  });
  taskList.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEdit(btn.dataset.id));
  });
  taskList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteTask(btn.dataset.id));
  });
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Modal ─────────────────────────────────────────────────────────────────────
let selectedPriority = 'med';

function openAdd() {
  editingId = null;
  modalTitle.textContent = 'New Task';
  titleInput.value = '';
  dateInput.value = '';
  setPriority('med');
  showModal();
}

function openEdit(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingId = id;
  modalTitle.textContent = 'Edit Task';
  titleInput.value = task.title;
  dateInput.value = task.dueDate || '';
  setPriority(task.priority || 'med');
  showModal();
}

function showModal() {
  modalOverlay.classList.add('open');
  setTimeout(() => titleInput.focus(), 200);
}

function closeModal() {
  modalOverlay.classList.remove('open');
}

function setPriority(p) {
  selectedPriority = p;
  document.querySelectorAll('.priority-opt').forEach(el => {
    el.className = 'priority-opt';
    if (el.dataset.priority === p) el.classList.add(`selected-${p}`);
  });
}

document.querySelectorAll('.priority-opt').forEach(btn => {
  btn.addEventListener('click', () => setPriority(btn.dataset.priority));
});

document.getElementById('btn-add').addEventListener('click', openAdd);
document.getElementById('btn-cancel').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

taskForm.addEventListener('submit', async e => {
  e.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;
  const data = { title, priority: selectedPriority, dueDate: dateInput.value || null };
  if (editingId) {
    await updateTask(editingId, data);
  } else {
    await addTask(data);
  }
  closeModal();
});

// Swipe down to close modal on mobile
let touchStartY = 0;
modalOverlay.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
modalOverlay.addEventListener('touchend', e => {
  if (e.changedTouches[0].clientY - touchStartY > 80) closeModal();
}, { passive: true });

// ── ASCII Background Animations ───────────────────────────────────────────────
const asciiState     = { plane: false, birds: false, clouds: false };
const asciiIntervals = { plane: null,  birds: null,  clouds: null  };

const PLANE_ART  = '──────────────────✈';
const BIRD_ARTS  = ['^', '^ ^', '^  ^', '^ ^ ^', '^   ^   ^', '^ ^  ^  ^'];
const CLOUD_ARTS = [
  '  .~~~~.\n (      )\n  `~~~~\'',
  '  .~~~~~~~~~~~~.\n (              )\n  `~~~~~~~~~~~~\'',
  '  .~~~~~~~~~~~~~~~~~~~~~~.\n (                        )\n  `~~~~~~~~~~~~~~~~~~~~~~\''
];

function spawnEl({ content, cls, yMin, yMax, duration, fontSize, opacity }) {
  const el = document.createElement('pre');
  el.className = `ascii-el ${cls}`;
  el.textContent = content;
  el.style.top = (Math.random() * (yMax - yMin) + yMin) + 'vh';
  el.style.animationDuration = duration + 's';
  el.style.fontSize = fontSize;
  el.style.opacity = opacity;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function startPlane() {
  const spawn = () => spawnEl({
    content: PLANE_ART, cls: 'ascii-plane',
    yMin: 5, yMax: 65,
    duration: 28 + Math.random() * 12,
    fontSize: '0.85rem', opacity: '0.22'
  });
  spawn();
  asciiIntervals.plane = setInterval(spawn, 20000);
}

function startBirds() {
  const spawnFlock = () => {
    const count   = 3 + Math.floor(Math.random() * 4);
    const baseY   = 5 + Math.random() * 65;
    const baseDur = 14 + Math.random() * 8;
    for (let i = 0; i < count; i++) {
      setTimeout(() => spawnEl({
        content: BIRD_ARTS[Math.floor(Math.random() * BIRD_ARTS.length)],
        cls: 'ascii-birds',
        yMin: Math.max(0, baseY - 6),
        yMax: Math.min(92, baseY + 6),
        duration: baseDur + Math.random() * 4,
        fontSize: '1rem', opacity: '0.32'
      }), i * 350);
    }
  };
  spawnFlock();
  asciiIntervals.birds = setInterval(spawnFlock, 7000);
}

function startClouds() {
  const spawn = () => spawnEl({
    content: CLOUD_ARTS[Math.floor(Math.random() * CLOUD_ARTS.length)],
    cls: 'ascii-clouds',
    yMin: 2, yMax: 72,
    duration: 35 + Math.random() * 20,
    fontSize: '1.1rem', opacity: '0.42'
  });
  spawn();
  asciiIntervals.clouds = setInterval(spawn, 6000);
}

function stopAnimation(type) {
  clearInterval(asciiIntervals[type]);
  asciiIntervals[type] = null;
  document.querySelectorAll(`.ascii-${type}`).forEach(el => el.remove());
}

function toggleAnimation(type) {
  asciiState[type] = !asciiState[type];
  document.getElementById(`toggle-${type}`).classList.toggle('active', asciiState[type]);
  if (asciiState[type]) {
    if (type === 'plane')  startPlane();
    if (type === 'birds')  startBirds();
    if (type === 'clouds') startClouds();
  } else {
    stopAnimation(type);
  }
}

document.getElementById('toggle-plane').addEventListener('click',  () => toggleAnimation('plane'));
document.getElementById('toggle-birds').addEventListener('click',  () => toggleAnimation('birds'));
document.getElementById('toggle-clouds').addEventListener('click', () => toggleAnimation('clouds'));

// ── Service worker ─────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/tsk/sw.js'));
}
