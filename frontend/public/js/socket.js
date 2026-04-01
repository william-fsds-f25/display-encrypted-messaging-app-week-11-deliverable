// frontend/src/js/socket.js
import { getToken, truncate } from './utils.js';

let socket = null;

export function initSocket(onNewMessage) {
    const token = getToken();
    if (!token) return null;
    
    if (socket) {
        socket.disconnect();
    }
    
    socket = io('http://localhost:5000', { auth: { token } });
    
    socket.on('connect', () => {
        console.log('✅ Socket connected');
    });
    
    socket.on('new_message', (msg) => {
        // Log encrypted message only
        try {
            const parsed = JSON.parse(msg.message_text);
            if (parsed.forRecipient) {
                console.log(`📨 Received: ${truncate(parsed.forRecipient.encryptedMessage)}`);
            } else if (parsed.encryptedMessage) {
                console.log(`📨 Received: ${truncate(parsed.encryptedMessage)}`);
            } else {
                console.log(`📨 Received: ${truncate(msg.message_text)}`);
            }
        } catch {
            console.log(`📨 Received: ${truncate(msg.message_text)}`);
        }
        
        if (onNewMessage) onNewMessage(msg);
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
    });
    
    socket.on('connect_error', (err) => {
        console.error('Socket error:', err.message);
    });
    
    return socket;
}

export function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

export function getSocket() {
    return socket;
}