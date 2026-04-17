const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const open = require('open');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Multer config for uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// ==================== ANTI-DETECTION UTILITIES ====================

// Gaussian random: produces more natural bell-curve delays (humans aren't uniform)
function gaussianRandom(mean, stdDev) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return Math.max(0, num * stdDev + mean);
}

// Human-like delay: 45-120 seconds with gaussian distribution centered at ~60s
function getHumanDelay() {
    const base = gaussianRandom(60000, 20000); // mean 60s, stddev 20s
    const jitter = Math.random() * 10000; // 0-10s extra jitter
    return Math.max(30000, Math.min(180000, base + jitter)); // clamp 30s-180s
}

// Typing duration based on message length (humans type ~40 words/min)
function getTypingDuration(message) {
    if (!message) return 2000;
    const words = message.split(/\s+/).length;
    const baseTime = (words / 40) * 60000; // time to "type" at 40 wpm
    const variation = gaussianRandom(baseTime, baseTime * 0.3);
    return Math.max(3000, Math.min(15000, variation)); // clamp 3s-15s
}

// Spintax processor: "Hello {friend|buddy|pal}" -> random pick per send
function processSpintax(text) {
    if (!text) return text;
    return text.replace(/\{([^{}]+)\}/g, (match, group) => {
        const options = group.split('|');
        return options[Math.floor(Math.random() * options.length)];
    });
}

// Shuffle array (Fisher-Yates) so contacts aren't sent in predictable order
function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Session tracking for daily limits
const sessionStats = {
    date: new Date().toDateString(),
    messagesSent: 0,
    dailyLimit: 200, // conservative daily limit
    reset() {
        const today = new Date().toDateString();
        if (this.date !== today) {
            this.date = today;
            this.messagesSent = 0;
        }
    }
};

// ==================== WHATSAPP CLIENT ====================

// WhatsApp Client with stealth browser config
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--window-size=1366,768',
            '--lang=pt-BR,pt',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        ],
        protocolTimeout: 300000
    }
});

let qrCodeData = null;
let clientReady = false;

client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrCodeData = qr;
    io.emit('qr', qr);
});

client.on('ready', () => {
    console.log('Client is ready!');
    clientReady = true;
    io.emit('ready', { message: 'WhatsApp conectado!' });
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
    io.emit('authenticated', { message: 'Autenticado com sucesso!' });
});

client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
    io.emit('auth_failure', { message: 'Falha na autenticação.' });
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
    clientReady = false;
    io.emit('disconnected', { message: 'WhatsApp desconectado.' });
    client.initialize(); // Reinitialize to allow reconnection
});

// Socket connection handler
io.on('connection', (socket) => {
    console.log('New client connected');
    if (clientReady) {
        socket.emit('ready', { message: 'WhatsApp já conectado!' });
    } else if (qrCodeData) {
        socket.emit('qr', qrCodeData);
    }
});

// API Routes

// Get all chats and contacts merged
app.get('/api/chats', async (req, res) => {
    console.log('API /api/chats requested');
    if (!clientReady) {
        console.log('Client not ready yet');
        return res.status(503).json({ error: 'WhatsApp is initializing, please wait...' });
    }
    try {
        console.log('Fetching chats and contacts from WhatsApp client...');

        // Fetch both in parallel
        const [chats, contacts] = await Promise.all([
            client.getChats(),
            client.getContacts()
        ]);

        console.log(`Fetched ${chats.length} chats and ${contacts.length} contacts`);

        const includeGroups = req.query.includeGroups === 'true';
        const mergedMap = new Map();

        // 1. Process Chats (Active conversations)
        // These are valuable because they have timestamp and unreadCount
        chats.forEach(chat => {
            if (!includeGroups && chat.isGroup) return; // Skip groups if not requested

            mergedMap.set(chat.id._serialized, {
                id: chat.id._serialized,
                name: chat.name || chat.id.user,
                isGroup: chat.isGroup,
                unreadCount: chat.unreadCount,
                timestamp: chat.timestamp,
                source: 'chat'
            });
        });

        // 2. Process Contacts (Saved numbers, etc.)
        // Merge into existing chats or add new ones
        contacts.forEach(contact => {
            if (!includeGroups && contact.isGroup) return; // Skip groups if not requested
            if (contact.isMe) return; // Skip self

            const existing = mergedMap.get(contact.id._serialized);

            // Use the best available name
            // 'name' is usually the name saved in phonebook
            // 'pushname' is the name set by the user on their profile
            const bestName = contact.name || contact.pushname || contact.number;

            if (existing) {
                // Update name if we found a better one (e.g. contact name preferred over chat name which might be just number)
                if (contact.name) {
                    existing.name = contact.name;
                }
            } else {
                // Add new contact that doesn't have an active chat
                mergedMap.set(contact.id._serialized, {
                    id: contact.id._serialized,
                    name: bestName,
                    isGroup: contact.isGroup,
                    unreadCount: 0,
                    timestamp: 0, // No active chat timestamp
                    source: 'contact'
                });
            }
        });

        const formattedResults = Array.from(mergedMap.values());

        // Sort by timestamp (desc) then name (asc)
        formattedResults.sort((a, b) => {
            if (b.timestamp !== a.timestamp) {
                return b.timestamp - a.timestamp;
            }
            return (a.name || '').localeCompare(b.name || '');
        });

        console.log(`Returning ${formattedResults.length} merged items`);
        res.json(formattedResults);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Failed to fetch data: ' + error.message });
    }
});

// Send messages
app.post('/api/send', upload.single('file'), async (req, res) => {
    if (!clientReady) {
        return res.status(503).json({ error: 'WhatsApp client not ready' });
    }

    const { contacts, message } = req.body;
    const file = req.file;
    let contactList = [];

    try {
        contactList = JSON.parse(contacts);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid contacts format' });
    }

    if (!contactList || contactList.length === 0) {
        return res.status(400).json({ error: 'No contacts selected' });
    }

    // Process sending in background
    processSendQueue(contactList, message, file);

    res.json({ success: true, message: 'Envio iniciado.' });
});

// Settings API - get/update daily limit
app.get('/api/settings', (req, res) => {
    sessionStats.reset();
    res.json({
        dailyLimit: sessionStats.dailyLimit,
        messagesSentToday: sessionStats.messagesSent,
        remaining: sessionStats.dailyLimit - sessionStats.messagesSent
    });
});

app.post('/api/settings', (req, res) => {
    const { dailyLimit } = req.body;
    if (dailyLimit && typeof dailyLimit === 'number' && dailyLimit > 0 && dailyLimit <= 500) {
        sessionStats.dailyLimit = dailyLimit;
        res.json({ success: true, dailyLimit: sessionStats.dailyLimit });
    } else {
        res.status(400).json({ error: 'Limite deve ser entre 1 e 500' });
    }
});

// Calculate milliseconds until next day at a random hour (6-9 AM)
function msUntilNextDay() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    // Random start hour between 6:00 and 9:00
    const startHour = 6 + Math.floor(Math.random() * 3);
    const startMin = Math.floor(Math.random() * 60);
    tomorrow.setHours(startHour, startMin, 0, 0);
    return tomorrow.getTime() - now.getTime();
}

async function processSendQueue(contacts, message, file) {
    const { MessageMedia } = require('whatsapp-web.js');
    let media = null;

    if (file) {
        try {
            media = MessageMedia.fromFilePath(file.path);
        } catch (error) {
            console.error('Error loading media:', error);
            io.emit('log', { type: 'error', message: 'Erro ao carregar arquivo de mídia.' });
            return;
        }
    }

    // Shuffle contacts so the order is unpredictable (avoids sequential patterns)
    contacts = shuffleArray(contacts);

    let successCount = 0;
    let failCount = 0;
    let consecutiveErrors = 0;
    let dayNumber = 1;

    io.emit('log', { type: 'info', message: `Iniciando envio para ${contacts.length} contatos. Limite diário: ${sessionStats.dailyLimit}. Dias estimados: ${Math.ceil(contacts.length / sessionStats.dailyLimit)}.` });

    // Mark presence as online at the start
    try {
        await client.sendPresenceAvailable();
    } catch (e) { /* ignore */ }

    for (let i = 0; i < contacts.length; i++) {
        const contactId = contacts[i];

        // --- CHECK DAILY LIMIT: pause until next day if reached ---
        sessionStats.reset();
        if (sessionStats.messagesSent >= sessionStats.dailyLimit) {
            const waitMs = msUntilNextDay();
            const waitHours = Math.round(waitMs / 3600000 * 10) / 10;

            io.emit('log', { type: 'info', message: `Dia ${dayNumber} finalizado: ${sessionStats.messagesSent} mensagens enviadas. Pausando ~${waitHours}h até amanhã...` });
            console.log(`Daily limit reached. Sleeping ${waitHours}h until next day...`);

            // Go offline during the overnight pause
            try { await client.sendPresenceUnavailable(); } catch (e) { /* ignore */ }

            await new Promise(resolve => setTimeout(resolve, waitMs));

            // Reset for new day
            sessionStats.messagesSent = 0;
            sessionStats.date = new Date().toDateString();
            dayNumber++;

            io.emit('log', { type: 'info', message: `Dia ${dayNumber} iniciado. Retomando envio... (${contacts.length - i} contatos restantes)` });

            try { await client.sendPresenceAvailable(); } catch (e) { /* ignore */ }

            // Small warmup delay at the start of a new day (1-3 min)
            const warmup = Math.floor(Math.random() * 120000) + 60000;
            await new Promise(resolve => setTimeout(resolve, warmup));
        }

        try {
            // --- SIMULATE HUMAN BEHAVIOR ---

            // 1. Get the chat object for typing simulation
            const chat = await client.getChatById(contactId);

            // 2. Mark messages as seen (humans read before replying)
            try {
                await chat.sendSeen();
            } catch (e) { /* some chats may not support this */ }

            // 3. Small "reading" pause before typing (1-5 seconds)
            const readingPause = Math.floor(Math.random() * 4000) + 1000;
            await new Promise(resolve => setTimeout(resolve, readingPause));

            // 4. Process spintax for this specific message (each contact gets a unique variation)
            const personalizedMessage = processSpintax(message);

            // 5. Simulate typing indicator
            try {
                await chat.sendStateTyping();
            } catch (e) { /* ignore */ }

            // 6. Wait a realistic "typing" duration based on message length
            const typingTime = getTypingDuration(personalizedMessage);
            await new Promise(resolve => setTimeout(resolve, typingTime));

            // 7. Clear typing state
            try {
                await chat.clearState();
            } catch (e) { /* ignore */ }

            // 8. Send the actual message
            if (personalizedMessage && media) {
                await client.sendMessage(contactId, media, { caption: personalizedMessage });
            } else if (personalizedMessage) {
                await client.sendMessage(contactId, personalizedMessage);
            } else if (media) {
                await client.sendMessage(contactId, media);
            }

            successCount++;
            sessionStats.messagesSent++;
            consecutiveErrors = 0;

            io.emit('progress', {
                contactId,
                status: 'success',
                current: successCount + failCount,
                total: contacts.length
            });

            // --- HUMAN-LIKE DELAYS BETWEEN MESSAGES ---

            if (i < contacts.length - 1) {
                // Randomly go "offline" briefly (10% chance) to simulate natural behavior
                if (Math.random() < 0.10) {
                    try {
                        await client.sendPresenceUnavailable();
                        const offlineTime = Math.floor(Math.random() * 30000) + 15000; // 15-45s offline
                        io.emit('log', { type: 'info', message: `Simulando pausa offline (${Math.round(offlineTime / 1000)}s)...` });
                        await new Promise(resolve => setTimeout(resolve, offlineTime));
                        await client.sendPresenceAvailable();
                    } catch (e) { /* ignore */ }
                }

                // Primary delay: gaussian-distributed human-like wait
                const delay = getHumanDelay();
                console.log(`Waiting ${Math.round(delay / 1000)}s before next message...`);
                await new Promise(resolve => setTimeout(resolve, delay));

                // Long break every 20-35 messages (randomized batch size)
                const batchBreakAt = 20 + Math.floor(Math.random() * 15);
                const sentToday = sessionStats.messagesSent;
                if (sentToday % batchBreakAt === 0) {
                    const pauseTime = Math.floor(Math.random() * 600000) + 300000; // 5-15 minutes
                    const pauseMinutes = Math.round(pauseTime / 60000);
                    console.log(`Taking human break... ${pauseMinutes} minutes.`);

                    try { await client.sendPresenceUnavailable(); } catch (e) { /* ignore */ }

                    io.emit('log', { type: 'info', message: `Pausa natural de ${pauseMinutes} minutos para simular comportamento humano...` });
                    await new Promise(resolve => setTimeout(resolve, pauseTime));

                    try { await client.sendPresenceAvailable(); } catch (e) { /* ignore */ }
                }
            }

        } catch (error) {
            console.error(`Error sending to ${contactId}:`, error);
            failCount++;
            consecutiveErrors++;

            io.emit('progress', {
                contactId,
                status: 'error',
                error: error.message,
                current: successCount + failCount,
                total: contacts.length
            });

            // If too many consecutive errors, back off significantly (possible rate limit)
            if (consecutiveErrors >= 3) {
                const backoff = Math.floor(Math.random() * 300000) + 300000; // 5-10 min
                const backoffMin = Math.round(backoff / 60000);
                io.emit('log', { type: 'warning', message: `${consecutiveErrors} erros seguidos. Pausa de segurança de ${backoffMin} minutos...` });
                await new Promise(resolve => setTimeout(resolve, backoff));
                consecutiveErrors = 0;
            }

            // If 5+ consecutive errors, abort to protect the account
            if (consecutiveErrors >= 5) {
                io.emit('log', { type: 'error', message: 'Muitos erros seguidos. Envio abortado para proteger a conta.' });
                break;
            }
        }
    }

    // Go offline at the end
    try {
        await client.sendPresenceUnavailable();
    } catch (e) { /* ignore */ }

    io.emit('log', { type: 'info', message: `Envio completo em ${dayNumber} dia(s). Total: ${successCount} enviados, ${failCount} falhas.` });
    io.emit('complete', { success: successCount, failed: failCount });

    // Clean up uploaded file
    if (file) {
        try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
    }
}

// Start server
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    client.initialize();

    // Open browser automatically
    // open(`http://localhost:${port}`);
});
