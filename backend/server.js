const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const socketIO = require('socket.io');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();

// Use environment port (Render sets this automatically)
const PORT = process.env.PORT || 5000;

// ============ CORS CONFIGURATION ============
// List of allowed origins (add your frontend URLs here)
const allowedOrigins = [
    'https://display-encrypted-messaging-app-week-11-nyat.onrender.com',
    'http://localhost:3000',
    'http://localhost:5000'
];

// Dynamic CORS middleware
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            console.log('✅ CORS allowed for:', origin);
            callback(null, true);
        } else {
            console.log('❌ CORS blocked for:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests explicitly
app.options('*', cors());

// ============ SOCKET.IO WITH CORS ============
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// ============ MIDDLEWARE ============
app.use(express.json());

// ============ DATABASE SETUP ============
// Use environment variable for database path (Render persistent disk)
const dbPath = process.env.DATABASE_PATH || 'database.sqlite';
const db = new sqlite3.Database(dbPath);

// Helper: truncate to 50 chars
function truncate(str, max = 50) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '...' : str;
}

// Helper: extract and truncate encrypted payload for logging
function logEncrypted(label, messageText) {
    try {
        const parsed = JSON.parse(messageText);
        const sample = parsed.forRecipient?.encryptedMessage ||
                      parsed.encryptedMessage ||
                      messageText;
        console.log(`${label} | 🔒 ${truncate(sample)}`);
    } catch {
        console.log(`${label} | ${truncate(messageText)}`);
    }
}

// Create tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        public_key TEXT,
        encrypted_private_key TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        from_user TEXT,
        from_username TEXT,
        to_user TEXT,
        message_text TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Add encrypted_private_key column if it doesn't exist
    db.run(`ALTER TABLE users ADD COLUMN encrypted_private_key TEXT`, err => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Migration error:', err.message);
        }
    });

    console.log('✅ Database ready at:', dbPath);
});

const generateId = () => Math.random().toString(36).substring(2, 11);

// ============ AUTH MIDDLEWARE ============
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
        req.userId = decoded.userId;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// ============ TEST ROUTES ============
app.get('/', (req, res) => {
    res.json({ 
        message: 'Encrypted Messaging API is running!',
        status: 'active',
        cors_allowed_origins: allowedOrigins
    });
});

app.get('/api/test', (req, res) => {
    res.json({ message: 'Backend is working!' });
});

// ============ AUTH ROUTES ============
// Register
app.post('/api/register', async (req, res) => {
    const { username, email, password, publicKey, encryptedPrivateKey } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }

    const id = generateId();
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
        'INSERT INTO users (id, username, email, password, public_key, encrypted_private_key) VALUES (?, ?, ?, ?, ?, ?)',
        [id, username, email, hashedPassword, publicKey || '', encryptedPrivateKey || ''],
        function(err) {
            if (err) {
                return res.status(400).json({ error: 'Username or email already exists' });
            }
            const token = jwt.sign({ userId: id }, process.env.JWT_SECRET || 'secret123');
            res.json({
                token,
                user: { id, username, email, publicKey: publicKey || '', encryptedPrivateKey: encryptedPrivateKey || '' }
            });
        }
    );
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err || !user) {
            return res.status(400).json({ error: 'User not found' });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(400).json({ error: 'Invalid password' });
        }

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret123');
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                publicKey: user.public_key,
                encryptedPrivateKey: user.encrypted_private_key || ''
            }
        });
    });
});

// ============ USER ROUTES ============
// Get users
app.get('/api/users', verifyToken, (req, res) => {
    db.all('SELECT id, username, public_key FROM users WHERE id != ?', [req.userId], (err, users) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ users: users || [] });
    });
});

// ============ MESSAGE ROUTES ============
// Get messages
app.get('/api/messages/:userId', verifyToken, (req, res) => {
    db.all(
        `SELECT * FROM messages
         WHERE (from_user = ? AND to_user = ?)
            OR (from_user = ? AND to_user = ?)
         ORDER BY timestamp ASC`,
        [req.userId, req.params.userId, req.params.userId, req.userId],
        (err, messages) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ messages: messages || [] });
        }
    );
});

// Send message
app.post('/api/messages', verifyToken, (req, res) => {
    const { toUser, messageText } = req.body;
    const id = generateId();

    if (!messageText) {
        return res.status(400).json({ error: 'Message text is required' });
    }

    db.get('SELECT username FROM users WHERE id = ?', [req.userId], (err, sender) => {
        if (err || !sender) return res.status(500).json({ error: 'Sender not found' });

        db.run(
            'INSERT INTO messages (id, from_user, from_username, to_user, message_text) VALUES (?, ?, ?, ?, ?)',
            [id, req.userId, sender.username, toUser, messageText],
            function(err) {
                if (err) {
                    console.error('Save message error:', err);
                    return res.status(500).json({ error: 'Failed to save message' });
                }

                // Log only the encrypted snippet
                logEncrypted(` ${sender.username} → ${toUser}`, messageText);

                const messageData = {
                    id,
                    from_user: req.userId,
                    from_username: sender.username,
                    to_user: toUser,
                    message_text: messageText,
                    timestamp: new Date().toISOString()
                };

                io.to(`user:${toUser}`).emit('new_message', messageData);
                io.to(`user:${req.userId}`).emit('new_message', messageData);

                res.json({ success: true, id });
            }
        );
    });
});

// ============ SOCKET.IO ============
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token'));
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
        socket.userId = decoded.userId;
        next();
    } catch {
        next(new Error('Invalid token'));
    }
});

io.on('connection', socket => {
    console.log('🔌 Client connected:', socket.userId);
    socket.join(`user:${socket.userId}`);
    
    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.userId);
    });
});

// ============ START SERVER ============
server.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Test API: http://localhost:${PORT}/api/test`);
    console.log(`🔗 CORS allowed origins:`);
    allowedOrigins.forEach(origin => console.log(`     - ${origin}`));
    console.log('');
});
