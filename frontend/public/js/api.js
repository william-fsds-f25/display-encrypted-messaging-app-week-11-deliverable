// frontend/src/js/api.js
import { getToken } from './utils.js';

// Updated to use your Render backend URL
const API_URL = 'https://display-encrypted-messaging-app-week-11-1urj.onrender.com/api';

export async function apiRequest(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
}

export async function register(data) {
    return apiRequest('/register', { method: 'POST', body: JSON.stringify(data) });
}

export async function login(data) {
    return apiRequest('/login', { method: 'POST', body: JSON.stringify(data) });
}

export async function getUsers() {
    return apiRequest('/users');
}

export async function getMessages(userId) {
    return apiRequest(`/messages/${userId}`);
}

export async function sendMessage(data) {
    return apiRequest('/messages', { method: 'POST', body: JSON.stringify(data) });
}
