// frontend/src/js/socket.js
import { getToken } from './utils.js';

let socket = null;

// Updated to use your Render backend URL
const SOCKET_URL = 'https://display-encrypted-messaging-app-week-11-whqi.onrender.com';

export function initSocket(onNewMessage) {
    const token = getToken();
    if (!token) return null;
    
    if (socket) {
        socket.disconnect();
    }
    
    socket = io(SOCKET_URL, { auth: { token } });
    
    socket.on('connect', () => {
        console.log('✅ Socket connected');
    });
    
    socket.on('new_message', (msg) => {
        console.log('📨 New message received');
        if (onNewMessage) onNewMessage(msg);
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
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
