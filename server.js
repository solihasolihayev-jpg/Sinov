'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true },
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 40;
const rooms = new Map();

app.use(express.static('public'));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

const questionBank = [
  { text: 'Ilmiy matnda ishonchli xulosa chiqarish uchun eng muhim narsa nima?', answers: ['Dalil va mantiq', 'Faqat taxmin', 'Faqat uzun matn', 'Manbasiz fikr'], correct: 0 },
  { text: 'Muammoni hal qilishda birinchi foydali qadam qaysi?', answers: ['Muammoni aniqlash', 'Natijani taxmin qilish', 'Ma’lumotni yashirish', 'Tekshirishni to‘xtatish'], correct: 0 },
  { text: 'Jamoaviy ishda samarali muloqot nimaga yordam beradi?', answers: ['Vazifalarni tushunishga', 'Xatolarni yashirishga', 'Hammani chetlatishga', 'Maqsadni unutishga'], correct: 0 },
  { text: 'Manbani tekshirish nima uchun kerak?', answers: ['Ma’lumot ishonchliligini baholash', 'Matnni uzaytirish', 'Savolni qiyinlashtirish', 'Vaqtni bekor sarflash'], correct: 0 },
  { text: 'Qaysi yondashuv bilimni mustahkamlashga yordam beradi?', answers: ['Faol takrorlash', 'Faqat ko‘z yugurtirish', 'Javobni ko‘chirish', 'Mashq qilmaslik'], correct: 0 }
];

function codeForRoom() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from(crypto.randomBytes(6), b => alphabet[b % alphabet.length]).join('');
  } while (rooms.has(code));
  return code;
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    questionIndex: room.questionIndex,
    question: room.status === 'playing' && room.questionIndex >= 0
      ? {
          text: room.questions[room.questionIndex].text,
          answers: room.questions[room.questionIndex].answers
        }
      : null,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, avatar: p.avatar, score: p.score,
      answered: p.answered
    })).sort((a, b) => b.score - a.score),
    maxPlayers: MAX_PLAYERS
  };
}

function emitRoom(room) {
  io.to(room.code).emit('room:update', publicRoom(room));
}

function cleanName(value) {
  const name = String(value || '').trim().replace(/[<>]/g, '').slice(0, 20);
  return name || 'Talaba';
}

io.on('connection', socket => {
  socket.on('room:create', ({ name, avatar } = {}, callback = () => {}) => {
    // A socket can belong to only one room in this starter.
    if (socket.data.roomCode) leaveRoom(socket);
    const code = codeForRoom();
    const room = {
      code, hostId: socket.id, status: 'lobby', questionIndex: -1,
      questions: questionBank, players: new Map()
    };
    room.players.set(socket.id, {
      id: socket.id, name: cleanName(name), avatar: validAvatar(avatar),
      score: 0, answered: false
    });
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    callback({ ok: true, code, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on('room:join', ({ code, name, avatar } = {}, callback = () => {}) => {
    if (socket.data.roomCode) leaveRoom(socket);
    const normalized = String(code || '').trim().toUpperCase();
    const room = rooms.get(normalized);
    if (!room) return callback({ ok: false, error: 'Bunday xona topilmadi. Xona kodini tekshiring.' });
    if (room.players.size >= MAX_PLAYERS) return callback({ ok: false, error: 'Xona to‘la (maksimum 40 ishtirokchi).' });
    if (room.status !== 'lobby') return callback({ ok: false, error: 'O‘yin boshlangan. Yangi xona oching yoki keyingi raundni kuting.' });

    room.players.set(socket.id, {
      id: socket.id, name: cleanName(name), avatar: validAvatar(avatar),
      score: 0, answered: false
    });
    socket.join(normalized);
    socket.data.roomCode = normalized;
    callback({ ok: true, code: normalized, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on('game:start', (_payload, callback = () => {}) => {
    const room = getHostRoom(socket);
    if (!room) return callback({ ok: false, error: 'Faqat xona egasi o‘yinni boshlashi mumkin.' });
    if (room.players.size < 1) return callback({ ok: false, error: 'O‘yinchi yo‘q.' });
    room.status = 'playing';
    room.questionIndex = 0;
    for (const p of room.players.values()) p.answered = false;
    emitRoom(room);
    callback({ ok: true });
  });

  socket.on('answer:submit', ({ answerIndex } = {}, callback = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing') return callback({ ok: false, error: 'Hozir savol faol emas.' });
    const player = room.players.get(socket.id);
    if (!player) return callback({ ok: false, error: 'O‘yinchi xonada topilmadi.' });
    if (player.answered) return callback({ ok: false, error: 'Bu savolga javob berib bo‘lgansiz.' });
    const question = room.questions[room.questionIndex];
    const idx = Number(answerIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= question.answers.length) {
      return callback({ ok: false, error: 'Javob varianti noto‘g‘ri.' });
    }
    player.answered = true;
    const correct = idx === question.correct;
    if (correct) player.score += 100;
    callback({ ok: true, correct, message: correct ? 'To‘g‘ri javob! +100 ball' : 'Noto‘g‘ri javob.' });
    emitRoom(room);

    const everyoneAnswered = [...room.players.values()].every(p => p.answered);
    if (everyoneAnswered) advanceQuestion(room);
  });

  socket.on('game:next', (_payload, callback = () => {}) => {
    const room = getHostRoom(socket);
    if (!room) return callback({ ok: false, error: 'Faqat xona egasi keyingi savolga o‘tkaza oladi.' });
    if (room.status !== 'playing') return callback({ ok: false, error: 'O‘yin faol emas.' });
    advanceQuestion(room);
    callback({ ok: true });
  });

  socket.on('room:leave', () => leaveRoom(socket));
  socket.on('disconnect', () => leaveRoom(socket));
});

function validAvatar(value) {
  const allowed = ['cyan', 'purple', 'gold', 'pink', 'green', 'blue'];
  return allowed.includes(value) ? value : 'cyan';
}

function getHostRoom(socket) {
  const room = rooms.get(socket.data.roomCode);
  return room && room.hostId === socket.id ? room : null;
}

function advanceQuestion(room) {
  room.questionIndex += 1;
  if (room.questionIndex >= room.questions.length) {
    room.status = 'finished';
    room.questionIndex = -1;
  } else {
    for (const p of room.players.values()) p.answered = false;
  }
  emitRoom(room);
}

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.leave(code);
  delete socket.data.roomCode;
  if (!room) return;
  room.players.delete(socket.id);
  if (room.players.size === 0) {
    rooms.delete(code);
    return;
  }
  if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
  emitRoom(room);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`EDUVERSE 3D running on port ${PORT}`);
});
