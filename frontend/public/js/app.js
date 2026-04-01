// frontend/src/js/app.js
import { 
    getPrivateKey, setPrivateKey, setPublicKey, 
    getToken, setToken, clearStorage, truncate 
} from './utils.js';
import { EncryptionService } from './encryption.js';
import { register, login, getUsers, getMessages, sendMessage } from './api.js';
import { initSocket, disconnectSocket } from './socket.js';

const encryption = new EncryptionService();
let currentUser = null;
let selectedUser = null;
let allUsers = [];
let sentMessageCache = {};

// Decrypt message text
async function decryptMessageText(messageText, isSent) {
    if (!messageText) return '';
    
    let parsed;
    try { parsed = JSON.parse(messageText); }
    catch { return messageText; }
    
    const privateKey = getPrivateKey();
    
    // Dual-encrypted format
    if (parsed.forRecipient && parsed.forSender) {
        if (!privateKey) return '[Key missing]';
        const payload = isSent ? parsed.forSender : parsed.forRecipient;
        try {
            const text = await encryption.decryptMessage(payload, privateKey);
            console.log(`✅ Decrypted (${isSent ? 'sent' : 'received'}): "${text}"`);
            return text;
        } catch (e) {
            return '[Decryption error]';
        }
    }
    
    // Legacy single-encrypted
    if (parsed.encryptedMessage) {
        if (isSent) return '[Sent message]';
        if (!privateKey) return '[Key missing]';
        try {
            const text = await encryption.decryptMessage(parsed, privateKey);
            console.log(`✅ Decrypted: "${text}"`);
            return text;
        } catch (e) {
            return '[Decryption error]';
        }
    }
    
    return messageText;
}

// Render authentication screen
function renderAuth() {
    const isSignup = window._isSignup || false;
    document.getElementById('app').innerHTML = `
        <div class="container">
            <div class="auth-box">
                <h2>🔒 ${isSignup ? 'Create Account' : 'Login'}</h2>
                ${isSignup ? '<input type="text" id="username" placeholder="Username">' : ''}
                <input type="email" id="email" placeholder="Email">
                <input type="password" id="password" placeholder="Password">
                <button id="submitBtn">${isSignup ? 'Sign Up' : 'Login'}</button>
                <button id="switchBtn" class="switch-btn">
                    ${isSignup ? 'Already have an account? Login' : 'Create new account'}
                </button>
                <div id="authMessage"></div>
            </div>
        </div>
    `;
    
    document.getElementById('submitBtn').onclick = async () => {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const msgDiv = document.getElementById('authMessage');
        msgDiv.innerText = '';
        
        try {
            if (isSignup) {
                const username = document.getElementById('username').value.trim();
                msgDiv.innerText = 'Generating keys...';
                
                const { publicKey, privateKey } = await encryption.generateKeyPair();
                const encryptedPrivateKeyData = await encryption.encryptPrivateKeyWithPassword(privateKey, password);
                
                setPrivateKey(privateKey);
                setPublicKey(publicKey);
                
                msgDiv.innerText = 'Registering...';
                const res = await register({
                    username, email, password, publicKey,
                    encryptedPrivateKey: JSON.stringify(encryptedPrivateKeyData)
                });
                
                setToken(res.token);
                localStorage.setItem('userId', res.user.id);
                localStorage.setItem('username', res.user.username);
                currentUser = res.user;
                initSocket(onNewMessage);
                renderChat();
                
            } else {
                msgDiv.innerText = 'Logging in...';
                const res = await login({ email, password });
                
                setToken(res.token);
                localStorage.setItem('userId', res.user.id);
                localStorage.setItem('username', res.user.username);
                
                if (res.user.publicKey) {
                    setPublicKey(res.user.publicKey);
                }
                
                if (!getPrivateKey() && res.user.encryptedPrivateKey) {
                    msgDiv.innerText = 'Decrypting private key...';
                    const encData = JSON.parse(res.user.encryptedPrivateKey);
                    const privateKey = await encryption.decryptPrivateKeyWithPassword(encData, password);
                    setPrivateKey(privateKey);
                    console.log('✅ Private key restored');
                }
                
                currentUser = res.user;
                initSocket(onNewMessage);
                renderChat();
            }
        } catch (err) {
            msgDiv.innerText = err.message;
            msgDiv.className = 'error';
        }
    };
    
    document.getElementById('switchBtn').onclick = () => {
        window._isSignup = !isSignup;
        renderAuth();
    };
}

// Render chat interface
async function renderChat() {
    document.getElementById('app').innerHTML = '<div class="loading">Loading messages...</div>';
    
    try {
        currentUser = {
            id: localStorage.getItem('userId'),
            username: localStorage.getItem('username')
        };
        
        const usersRes = await getUsers();
        allUsers = usersRes.users || [];
        
        let messages = [];
        if (selectedUser) {
            const msgsRes = await getMessages(selectedUser.id);
            const rawMessages = msgsRes.messages || [];
            
            for (const msg of rawMessages) {
                const isSent = msg.from_user === currentUser.id;
                
                // Log encrypted payload
                try {
                    const p = JSON.parse(msg.message_text);
                    if (p.forRecipient) {
                        console.log(`[${isSent ? 'sent' : 'received'}] encrypted: ${truncate(p.forRecipient.encryptedMessage)}`);
                    } else if (p.encryptedMessage) {
                        console.log(`[${isSent ? 'sent' : 'received'}] encrypted: ${truncate(p.encryptedMessage)}`);
                    }
                } catch { /* plain text */ }
                
                if (isSent && sentMessageCache[msg.id]) {
                    msg.displayText = sentMessageCache[msg.id];
                } else {
                    msg.displayText = await decryptMessageText(msg.message_text, isSent);
                }
                messages.push(msg);
            }
        }
        
        document.getElementById('app').innerHTML = `
            <div class="container">
                <div class="navbar">
                    <h3>🔒 Encrypted Chat</h3>
                    <div>
                        <span>Hello, ${currentUser?.username || 'User'}</span>
                        <button id="logoutBtn" class="logout-btn">Logout</button>
                    </div>
                </div>
                <div class="chat-layout">
                    <div class="users-sidebar" id="usersList">
                        ${allUsers.map(u => `
                            <div class="user-item ${selectedUser?.id === u.id ? 'active' : ''}"
                                 data-id="${u.id}" data-username="${u.username}">
                                <strong>${u.username}</strong>
                            </div>
                        `).join('')}
                        ${allUsers.length === 0 ? '<div style="padding:15px;text-align:center">No other users found</div>' : ''}
                    </div>
                    <div class="chat-area">
                        <div class="messages" id="messages">
                            ${!selectedUser
                                ? '<div class="empty-chat"><p>👈 Select a user to start chatting</p></div>'
                                : `
                                ${messages.map(msg => {
                                    const isSent = msg.from_user === currentUser.id;
                                    const senderName = isSent ? 'You' : (msg.from_username || selectedUser?.username);
                                    const time = msg.timestamp
                                        ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        : '';
                                    return `
                                        <div class="message-row ${isSent ? 'sent' : 'received'}">
                                            <div class="message-bubble">
                                                <div class="message-sender">${senderName}</div>
                                                ${msg.displayText || ''}
                                                <div class="message-time">${time}</div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                                ${messages.length === 0 ? '<div class="empty-chat"><p>💬 No messages yet. Send a message!</p></div>' : ''}
                            `}
                        </div>
                        ${selectedUser ? `
                            <div class="message-input">
                                <input type="text" id="messageInput" placeholder="Type your message...">
                                <button id="sendBtn">Send</button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        const messagesDiv = document.getElementById('messages');
        if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        document.querySelectorAll('.user-item').forEach(el => {
            el.onclick = () => {
                selectedUser = { id: el.dataset.id, username: el.dataset.username };
                renderChat();
            };
        });
        
        const sendBtn = document.getElementById('sendBtn');
        const messageInput = document.getElementById('messageInput');
        
        if (sendBtn && messageInput) {
            sendBtn.onclick = async () => {
                const text = messageInput.value.trim();
                if (!text || !selectedUser) return;
                
                sendBtn.disabled = true;
                messageInput.disabled = true;
                
                try {
                    const recipient = allUsers.find(u => u.id === selectedUser.id);
                    let messageToSend = text;
                    let usedFallback = false;
                    
                    if (recipient?.public_key) {
                        console.log(`📤 Sending to ${selectedUser.username}: "${text}"`);
                        const senderPubKey = localStorage.getItem('publicKey');
                        if (senderPubKey) {
                            const dual = await encryption.encryptMessageDual(text, recipient.public_key, senderPubKey);
                            messageToSend = JSON.stringify(dual);
                        } else {
                            console.warn('No sender public key — fallback to single encrypt');
                            const enc = await encryption.encryptMessage(text, recipient.public_key);
                            messageToSend = JSON.stringify(enc);
                            usedFallback = true;
                        }
                    }
                    
                    const res = await sendMessage({ toUser: selectedUser.id, messageText: messageToSend });
                    if (usedFallback && res.id) sentMessageCache[res.id] = text;
                    
                    messageInput.value = '';
                    await renderChat();
                } catch (err) {
                    console.error('Send error:', err);
                    alert('Failed to send message');
                } finally {
                    sendBtn.disabled = false;
                    messageInput.disabled = false;
                    messageInput.focus();
                }
            };
            
            messageInput.onkeypress = e => {
                if (e.key === 'Enter') sendBtn.onclick();
            };
        }
        
        document.getElementById('logoutBtn').onclick = () => {
            clearStorage();
            disconnectSocket();
            currentUser = null;
            selectedUser = null;
            sentMessageCache = {};
            renderAuth();
        };
        
    } catch (err) {
        console.error('Render error:', err);
        document.getElementById('app').innerHTML = `<div class="error">Error: ${err.message}</div>`;
    }
}

// Handle new messages from socket
function onNewMessage(msg) {
    if (selectedUser && (msg.from_user === selectedUser.id || msg.to_user === selectedUser.id)) {
        renderChat();
    }
}

// Initialize app
if (getToken()) {
    initSocket(onNewMessage);
    renderChat();
} else {
    renderAuth();
}