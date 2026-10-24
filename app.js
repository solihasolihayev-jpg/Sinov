import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

const socket = window.io({ transports: ['websocket', 'polling'] });
const $ = id => document.getElementById(id);
let selectedAvatar = 'cyan';
let currentRoom = null;
let isHost = false;
let hasAnswered = false;
let lastQuestionIndex = -2;

const colors = { cyan: '#43ddf5', purple: '#9c73ff', gold: '#ffcb68', pink: '#ff78bc', green: '#4be0a5', blue: '#4d8dff' };

function notice(message, kind = '') {
  const el = $('notice');
  el.textContent = message;
  el.className = `notice ${kind}`;
}

document.querySelectorAll('.avatar-choice').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.avatar-choice').forEach(b => b.classList.remove('selected'));
    button.classList.add('selected');
    selectedAvatar = button.dataset.avatar;
  });
});

function playerDetails() {
  return { name: $('nickname').value.trim(), avatar: selectedAvatar };
}
function showRoom(code) {
  $('entryPanel').classList.add('hidden');
  $('roomPanel').classList.remove('hidden');
  $('roomCodeDisplay').textContent = code;
  $('roomTitle').textContent = isHost ? 'Sizning xonangiz' : 'O‘yin xonasi';
  $('roomSubtitle').textContent = isHost ? 'Ishtirokchilarni taklif qiling' : 'Xonaga muvaffaqiyatli qo‘shildingiz';
}
function handleRoomResult(result) {
  if (!result?.ok) return notice(result?.error || 'Xatolik yuz berdi.', 'error');
  currentRoom = result.room;
  isHost = result.room.hostId === socket.id;
  showRoom(result.code);
  notice('Xonaga muvaffaqiyatli ulandingiz!', 'success');
  renderRoom(result.room);
}

$('entryForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!playerDetails().name) return notice('Iltimos, taxallus kiriting.', 'error');
  socket.emit('room:create', playerDetails(), handleRoomResult);
});
$('joinBtn').addEventListener('click', () => {
  if (!playerDetails().name) return notice('Avval taxallus kiriting.', 'error');
  const code = $('roomCode').value.trim().toUpperCase();
  if (code.length !== 6) return notice('Xona kodi 6 ta belgidan iborat bo‘lishi kerak.', 'error');
  socket.emit('room:join', { ...playerDetails(), code }, handleRoomResult);
});
$('roomCode').addEventListener('input', e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
$('copyCodeBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('roomCodeDisplay').textContent); $('copyCodeBtn').textContent = 'Nusxalandi ✓'; }
  catch { $('copyCodeBtn').textContent = $('roomCodeDisplay').textContent; }
});
$('startBtn').addEventListener('click', () => socket.emit('game:start', {}, result => {
  if (!result.ok) notice(result.error, 'error');
}));
$('nextBtn').addEventListener('click', () => socket.emit('game:next', {}, result => {
  if (!result.ok) notice(result.error, 'error');
}));
$('leaveBtn').addEventListener('click', () => {
  socket.emit('room:leave');
  currentRoom = null; isHost = false; hasAnswered = false;
  $('roomPanel').classList.add('hidden'); $('entryPanel').classList.remove('hidden');
  $('questionBox').classList.add('hidden'); $('finishedBox').classList.add('hidden');
  $('startBtn').classList.remove('hidden'); $('nextBtn').classList.add('hidden');
  notice('Xonadan chiqdingiz.');
});
socket.on('room:update', room => {
  currentRoom = room;
  isHost = room.hostId === socket.id;
  renderRoom(room);
});
socket.on('connect', () => notice('Server bilan aloqa o‘rnatildi.', 'success'));
socket.on('disconnect', () => notice('Aloqa uzildi. Qayta ulanish kutilmoqda…', 'error'));
socket.on('connect_error', () => notice('Serverga ulanib bo‘lmadi. Internet yoki server manzilini tekshiring.', 'error'));

function renderRoom(room) {
  $('playerCount').textContent = `${room.players.length} / ${room.maxPlayers}`;
  $('playersList').innerHTML = '';
  room.players.forEach((player, index) => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'player-dot';
    dot.style.background = colors[player.avatar] || colors.cyan;
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = `${index + 1}. ${player.name}`;
    const score = document.createElement('span');
    score.className = 'player-score';
    score.textContent = `${player.score} ball`;
    li.append(dot, name);
    if (player.id === room.hostId) {
      const host = document.createElement('span'); host.className = 'host-tag'; host.textContent = 'HOST'; li.append(host);
    }
    li.append(score);
    $('playersList').append(li);
  });
  $('startBtn').classList.toggle('hidden', !isHost || room.status !== 'lobby');
  $('nextBtn').classList.toggle('hidden', !isHost || room.status !== 'playing');
  $('questionBox').classList.toggle('hidden', room.status !== 'playing');
  $('finishedBox').classList.toggle('hidden', room.status !== 'finished');
  if (room.status === 'playing' && room.question) {
    if (lastQuestionIndex !== room.questionIndex) {
      hasAnswered = false;
      lastQuestionIndex = room.questionIndex;
      $('answerFeedback').textContent = '';
    }
    $('questionNumber').textContent = `${room.questionIndex + 1}`;
    $('questionText').textContent = room.question.text;
    $('answerOptions').innerHTML = '';
    room.question.answers.forEach((answer, index) => {
      const button = document.createElement('button');
      button.className = 'answer-option';
      button.textContent = `${String.fromCharCode(65 + index)}. ${answer}`;
      button.disabled = hasAnswered;
      button.addEventListener('click', () => {
        hasAnswered = true;
        [...$('answerOptions').children].forEach(b => b.disabled = true);
        socket.emit('answer:submit', { answerIndex: index }, result => {
          if (!result.ok) { $('answerFeedback').textContent = result.error; return; }
          $('answerFeedback').textContent = result.message;
          button.classList.add(result.correct ? 'correct' : 'wrong');
        });
      });
      $('answerOptions').append(button);
    });
  } else if (room.status === 'finished') {
    lastQuestionIndex = -2;
    $('questionBox').classList.add('hidden');
    $('finishedBox').classList.remove('hidden');
  }
}

// Lightweight 3D lobby scene; the game UI remains usable if WebGL is unavailable.
function initScene() {
  const container = $('scene');
  try {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#10163d');
    scene.fog = new THREE.Fog('#10163d', 12, 32);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(0, 4.8, 11);
    camera.lookAt(0, 1.2, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0x9bdcff, 0x171333, 2));
    const key = new THREE.PointLight(0x54dfff, 25, 22); key.position.set(0, 5, 2); scene.add(key);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshStandardMaterial({ color: 0x0a1030, metalness: .45, roughness: .55 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.03; scene.add(floor);
    const grid = new THREE.GridHelper(40, 40, 0x397cbd, 0x233363); grid.position.y = 0.01; scene.add(grid);
    const mat = new THREE.MeshStandardMaterial({ color: 0x202c69, emissive: 0x182b73, emissiveIntensity: 1.1, metalness: .35, roughness: .3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x3bdbf6, emissive: 0x1677ba, emissiveIntensity: 1.4, metalness: .3, roughness: .22 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe6b95e, emissive: 0x664010, emissiveIntensity: .7, metalness: .6, roughness: .3 });
    const buildings = [];
    for (let i = 0; i < 9; i++) {
      const h = 1.3 + Math.random() * 3.6;
      const x = (i - 4) * 1.45;
      const building = new THREE.Mesh(new THREE.BoxGeometry(.85, h, .9), mat);
      building.position.set(x, h / 2, -3.6 - Math.random() * 1.5);
      scene.add(building); buildings.push(building);
      for (let w = 0; w < Math.floor(h * 1.5); w++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(.11, .12, .025), i % 2 ? glass : gold);
        win.position.set(x + (w % 2 ? .19 : -.19), .45 + Math.floor(w / 2) * .32, -3.12 - Math.random() * .02);
        scene.add(win);
      }
    }
    const portal = new THREE.Mesh(new THREE.TorusGeometry(1.35, .09, 12, 64), new THREE.MeshStandardMaterial({ color: 0x62e8ff, emissive: 0x2bceff, emissiveIntensity: 2, metalness: .3, roughness: .2 }));
    portal.position.set(0, 1.75, -.3); scene.add(portal);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(1.08, .025, 8, 64), gold); inner.position.copy(portal.position); scene.add(inner);
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(.48, 1), new THREE.MeshStandardMaterial({ color: 0x8c7aff, emissive: 0x4a37e7, emissiveIntensity: 1.5, metalness: .4, roughness: .2 }));
    orb.position.set(0, 1.8, -.4); scene.add(orb);
    const stars = new THREE.Group();
    for (let i = 0; i < 70; i++) {
      const star = new THREE.Mesh(new THREE.SphereGeometry(.018 + Math.random() * .025, 5, 5), new THREE.MeshBasicMaterial({ color: i % 3 ? 0x79eaff : 0xffd47c }));
      star.position.set((Math.random() - .5) * 22, 1 + Math.random() * 8, -8 + Math.random() * 8); stars.add(star);
    }
    scene.add(stars);
    const resize = () => {
      const w = Math.max(container.clientWidth, 1), h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    new ResizeObserver(resize).observe(container);
    let t = 0;
    const animate = () => {
      requestAnimationFrame(animate); t += .008;
      portal.rotation.z = Math.sin(t) * .08; inner.rotation.z = -t * .25;
      orb.rotation.y += .009; orb.position.y = 1.8 + Math.sin(t * 1.5) * .12;
      stars.rotation.y = Math.sin(t * .2) * .04;
      renderer.render(scene, camera);
    };
    animate();
  } catch (error) {
    container.innerHTML = '<div style="padding:24px;color:#aab8e8;font-size:12px">3D ko‘rinish ushbu brauzerda mavjud emas, lekin xona funksiyalari ishlashi mumkin.</div>';
  }
}
initScene();
