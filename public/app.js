const socket = io();
let allChats = [];
let selectedChats = new Set();
let isSending = false;

// DOM Elements
const qrcodeCanvas = document.getElementById('qrcode');
const statusBadge = document.getElementById('status-badge');
const qrContainer = document.getElementById('qr-container');
const controls = document.getElementById('controls');
const btnLoadChats = document.getElementById('btn-load-chats');
const chatListEl = document.getElementById('chat-list');
const chatSelectionPanel = document.getElementById('chat-selection');
const selectAllCheckbox = document.getElementById('select-all');
const toggleGroupsCheckbox = document.getElementById('toggle-groups');
const searchInput = document.getElementById('search-chat');
const btnSend = document.getElementById('btn-send');
const messageText = document.getElementById('message-text');
const mediaInput = document.getElementById('media-upload');
const fileNameDisplay = document.getElementById('file-name');
const totalChatsEl = document.getElementById('total-chats');
const selectedCountEl = document.getElementById('selected-count');

// Modal Elements
const progressModal = document.getElementById('progress-modal');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const progressLog = document.getElementById('progress-log');
const btnCloseProgress = document.getElementById('btn-close-progress');

// Socket Events
socket.on('qr', (qr) => {
    QRCode.toCanvas(qrcodeCanvas, qr, function (error) {
        if (error) console.error(error);
    });
    statusBadge.textContent = 'Aguardando Login';
    statusBadge.className = 'badge disconnected';
});

socket.on('ready', () => {
    statusBadge.textContent = 'Conectado';
    statusBadge.className = 'badge connected';
    qrContainer.classList.add('hidden');
    controls.classList.remove('hidden');
    chatSelectionPanel.classList.remove('hidden');
    loadChats(); // Auto-load chats on connect
});

socket.on('authenticated', () => {
    statusBadge.textContent = 'Autenticado';
    qrContainer.classList.add('hidden');
});

socket.on('progress', (data) => {
    const percentage = Math.round((data.current / data.total) * 100);
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${data.current}/${data.total} enviados`;

    const logItem = document.createElement('div');
    logItem.className = `log-item ${data.status}`;
    // Find chat name
    const chat = allChats.find(c => c.id === data.contactId);
    const name = chat ? chat.name : data.contactId;

    if (data.status === 'success') {
        logItem.textContent = `✓ Enviado para ${name}`;
    } else {
        logItem.textContent = `✗ Erro ao enviar para ${name}: ${data.error}`;
    }
    progressLog.appendChild(logItem);
    progressLog.scrollTop = progressLog.scrollHeight;
});

socket.on('complete', (data) => {
    isSending = false;
    btnSend.disabled = false;
    btnCloseProgress.classList.remove('hidden');
    const logItem = document.createElement('div');
    logItem.style.fontWeight = 'bold';
    logItem.style.marginTop = '10px';
    logItem.textContent = `FINALIZADO. Sucesso: ${data.success}, Falhas: ${data.failed}`;
    progressLog.appendChild(logItem);
    loadSettings(); // refresh daily counter
});

socket.on('log', (data) => {
    const logItem = document.createElement('div');
    logItem.className = `log-item ${data.type || 'info'}`;
    logItem.textContent = `ℹ ${data.message}`;
    progressLog.appendChild(logItem);
    progressLog.scrollTop = progressLog.scrollHeight;
});

// UI Actions
btnLoadChats.addEventListener('click', loadChats);

async function loadChats() {
    chatListEl.innerHTML = '<div class="loading">Carregando conversas...<br><small>Isso pode demorar um pouco...</small></div>';

    // Show a more urgent message after 5 seconds
    const timeoutMsg = setTimeout(() => {
        chatListEl.innerHTML = '<div class="loading">Sincronizando todos os contatos e conversas...<br><small>Isso pode levar até 1 minuto devido à quantidade de contatos.</small></div>';
    }, 3000);

    try {
        const includeGroups = toggleGroupsCheckbox.checked;
        const response = await fetch(`/api/chats?includeGroups=${includeGroups}`);
        clearTimeout(timeoutMsg);

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Falha ao carregar');
        }
        allChats = await response.json();

        // Groups already filtered on server
        // allChats = allChats.filter(c => !c.id.includes('@g.us')); 

        totalChatsEl.textContent = allChats.length;
        renderChats(allChats);
    } catch (error) {
        clearTimeout(timeoutMsg);
        chatListEl.innerHTML = `<div class="error">
            <p>Erro ao carregar contatos: ${error.message}</p>
            <button onclick="loadChats()" class="btn secondary" style="margin-top:10px">Tentar Novamente</button>
        </div>`;
    }
}

function renderChats(chats) {
    chatListEl.innerHTML = '';
    chats.forEach(chat => {
        const item = document.createElement('div');
        item.className = 'chat-item';
        const isSelected = selectedChats.has(chat.id);

        item.innerHTML = `
            <input type="checkbox" value="${chat.id}" ${isSelected ? 'checked' : ''}>
            <div class="chat-info">
                <div class="chat-name">${chat.name || 'Sem Nome'}</div>
                <div class="chat-meta">${chat.id.replace('@c.us', '')}</div>
            </div>
        `;

        const checkbox = item.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) selectedChats.add(chat.id);
            else selectedChats.delete(chat.id);
            updateSelection();
        });

        // Click on row to toggle
        item.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });

        chatListEl.appendChild(item);
    });
    updateSelection();
}

function updateSelection() {
    selectedCountEl.textContent = selectedChats.size;
    btnSend.disabled = selectedChats.size === 0;

    // Update select all checkbox state
    // selectAllCheckbox.checked = selectedChats.size === allChats.length && allChats.length > 0;
}

selectAllCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
        // Only select currently visible chats (in case of search filter)
        // For now select all loaded
        allChats.forEach(c => selectedChats.add(c.id));
    } else {
        selectedChats.clear();
    }
    renderChats(allChats);
    updateSelection();
});

searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allChats.filter(c =>
        (c.name && c.name.toLowerCase().includes(term)) ||
        c.id.includes(term)
    );
    renderChats(filtered);
});

toggleGroupsCheckbox.addEventListener('change', () => {
    loadChats();
});

mediaInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        fileNameDisplay.textContent = e.target.files[0].name;
    } else {
        fileNameDisplay.textContent = '';
    }
});

btnSend.addEventListener('click', async () => {
    if (selectedChats.size === 0) return;

    const text = messageText.value.trim();
    const file = mediaInput.files[0];

    if (!text && !file) {
        alert('Digite uma mensagem ou selecione um arquivo.');
        return;
    }

    if (!confirm(`Tem certeza que deseja enviar para ${selectedChats.size} contatos?`)) return;

    isSending = true;
    btnSend.disabled = true;
    showProgressModal();

    const formData = new FormData();
    formData.append('contacts', JSON.stringify(Array.from(selectedChats)));
    formData.append('message', text);
    if (file) {
        formData.append('file', file);
    }

    try {
        const response = await fetch('/api/send', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (result.error) throw new Error(result.error);
    } catch (error) {
        alert('Erro ao iniciar envio: ' + error.message);
        isSending = false;
        btnSend.disabled = false;
        progressModal.classList.add('hidden');
    }
});

function showProgressModal() {
    progressModal.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressLog.innerHTML = '';
    progressText.textContent = `0/${selectedChats.size} enviados`;
    btnCloseProgress.classList.add('hidden');
}

btnCloseProgress.addEventListener('click', () => {
    progressModal.classList.add('hidden');
});

// ==================== SETTINGS / DAILY LIMIT ====================

async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        const el = document.getElementById('daily-stats');
        if (el) {
            el.textContent = `Enviados hoje: ${data.messagesSentToday}/${data.dailyLimit} (restam ${data.remaining})`;
        }
    } catch (e) { /* ignore */ }
}

// Load settings on page load
loadSettings();
