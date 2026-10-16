// server.js
// Swapn Ev key verification server
// credit: @M4NI999

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OWNER_TOKEN = process.env.OWNER_TOKEN || 'SWAPN_MASTER_TOKEN_CHANGE_ME_2024';

// ---- data folder ----
const DATA_DIR = path.join(__dirname, 'data');
const KEYS_FILE   = path.join(DATA_DIR, 'keys.json');
const USED_FILE   = path.join(DATA_DIR, 'used.json');
const BANNED_FILE = path.join(DATA_DIR, 'banned.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(KEYS_FILE))   fs.writeFileSync(KEYS_FILE, '[]');
if (!fs.existsSync(USED_FILE))   fs.writeFileSync(USED_FILE, '[]');
if (!fs.existsSync(BANNED_FILE)) fs.writeFileSync(BANNED_FILE, '[]');

// ---- helpers ----
const read  = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

const isValidFormat = key => {
  if (!key || key.length !== 19) return false;
  if (key.substring(0, 3) !== 'FF-') return false;
  if (key[6] !== '-' || key[11] !== '-') return false;
  const allowed = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/;
  return allowed.test(key.substring(3, 6)) &&
         allowed.test(key.substring(7, 11)) &&
         allowed.test(key.substring(12, 16));
};

const randSeg = () => {
  const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
};

// ============== PUBLIC ==============

app.get('/', (req, res) => {
  res.json({
    name: 'Swapn Ev Key Server',
    status: 'online',
    ts: Date.now()
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    online: true,
    totalKeys: read(KEYS_FILE).length,
    usedKeys: read(USED_FILE).length,
    bannedKeys: read(BANNED_FILE).length,
    ts: Date.now()
  });
});

// verify key — game panel isko call karta hai
app.get('/api/verify', (req, res) => {
  const key = (req.query.key || '').toUpperCase().trim();
  if (!key) return res.json({ ok: false, msg: 'missing key' });
  if (!isValidFormat(key)) return res.json({ ok: false, msg: 'invalid format' });

  const keys = read(KEYS_FILE);
  const used = read(USED_FILE);
  const banned = read(BANNED_FILE);

  if (banned.includes(key)) return res.json({ ok: false, msg: 'key banned' });

  const entry = keys.find(k => k.key === key);
  if (!entry) return res.json({ ok: false, msg: 'key not found' });
  if (entry.expiresAt && entry.expiresAt < Date.now())
    return res.json({ ok: false, msg: 'key expired' });
  if (used.includes(key)) return res.json({ ok: false, msg: 'already used' });

  // mark used — one-time
  used.push(key);
  write(USED_FILE, used);

  res.json({
    ok: true,
    msg: 'OK',
    game: entry.game || 'FREE FIRE',
    expiresAt: entry.expiresAt,
    usedAt: Date.now()
  });
});

// ============== OWNER ==============

const authOwner = (req, res, next) => {
  const tok = req.query.token || req.headers['x-owner-token'];
  if (tok !== OWNER_TOKEN)
    return res.status(403).json({ ok: false, msg: 'forbidden' });
  next();
};

// generate keys
app.get('/api/owner/generate', authOwner, (req, res) => {
  const qty = Math.min(parseInt(req.query.qty) || 1, 500);
  const days = parseInt(req.query.days) || 7;
  const keys = read(KEYS_FILE);

  const created = [];
  for (let i = 0; i < qty; i++) {
    const key = `FF-${randSeg()}-${randSeg()}-${randSeg()}`;
    keys.push({
      key,
      game: 'FREE FIRE',
      expiresAt: days === 0 ? null : Date.now() + days * 86400000,
      createdAt: Date.now()
    });
    created.push(key);
  }
  write(KEYS_FILE, keys);
  res.json({ ok: true, count: created.length, keys: created });
});

// import key (website se)
app.get('/api/owner/import', authOwner, (req, res) => {
  const key = (req.query.key || '').toUpperCase().trim();
  const days = parseInt(req.query.days) || 7;
  if (!key || !isValidFormat(key))
    return res.json({ ok: false, msg: 'invalid key' });

  const keys = read(KEYS_FILE);
  const idx = keys.findIndex(k => k.key === key);
  const entry = {
    key,
    game: 'FREE FIRE',
    expiresAt: days === 0 ? null : Date.now() + days * 86400000,
    createdAt: Date.now()
  };

  if (idx !== -1) keys[idx] = entry;
  else keys.push(entry);

  write(KEYS_FILE, keys);
  res.json({ ok: true, key, imported: true });
});

// all keys
app.get('/api/owner/keys', authOwner, (req, res) => {
  res.json({
    ok: true,
    keys: read(KEYS_FILE),
    used: read(USED_FILE),
    banned: read(BANNED_FILE)
  });
});

// ban key
app.get('/api/owner/ban', authOwner, (req, res) => {
  const key = (req.query.key || '').toUpperCase().trim();
  if (!key) return res.json({ ok: false, msg: 'missing key' });
  const banned = read(BANNED_FILE);
  if (!banned.includes(key)) banned.push(key);
  write(BANNED_FILE, banned);
  res.json({ ok: true, msg: 'banned' });
});

// unban key
app.get('/api/owner/unban', authOwner, (req, res) => {
  const key = (req.query.key || '').toUpperCase().trim();
  const banned = read(BANNED_FILE).filter(k => k !== key);
  write(BANNED_FILE, banned);
  res.json({ ok: true, msg: 'unbanned' });
});

// reset usage
app.get('/api/owner/reset-used', authOwner, (req, res) => {
  const key = (req.query.key || '').toUpperCase().trim();
  const used = read(USED_FILE).filter(k => k !== key);
  write(USED_FILE, used);
  res.json({ ok: true, msg: 'reset' });
});

// delete key
app.get('/api/owner/delete', authOwner, (req, res) => {
  const key = (req.query.key || '').toUpperCase().trim();
  const keys = read(KEYS_FILE).filter(k => k.key !== key);
  write(KEYS_FILE, keys);
  res.json({ ok: true, msg: 'deleted' });
});

// clear everything
app.get('/api/owner/reset-all', authOwner, (req, res) => {
  write(KEYS_FILE, []);
  write(USED_FILE, []);
  write(BANNED_FILE, []);
  res.json({ ok: true, msg: 'all cleared' });
});

app.listen(PORT, () => {
  console.log(`Swapn Ev key server running on port ${PORT}`);
  console.log(`Owner token: ${OWNER_TOKEN}`);
  console.log(`Test: http://localhost:${PORT}/api/status`);
});