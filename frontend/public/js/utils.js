// frontend/src/js/utils.js

// Truncate string to max length
export function truncate(str, maxLength = 50) {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
}

// Base64 helpers
export function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// Generate random ID
export function generateId() {
    return Math.random().toString(36).substring(2, 11);
}

// Get/set localStorage helpers
export function getPrivateKey() {
    const key = localStorage.getItem('privateKey');
    return (key && key !== 'null' && key !== 'undefined') ? key : null;
}

export function getPublicKey() {
    const key = localStorage.getItem('publicKey');
    return (key && key !== 'null' && key !== 'undefined') ? key : null;
}

export function setPrivateKey(key) {
    localStorage.setItem('privateKey', key);
}

export function setPublicKey(key) {
    localStorage.setItem('publicKey', key);
}

export function getToken() {
    return localStorage.getItem('token');
}

export function setToken(token) {
    localStorage.setItem('token', token);
}

export function clearStorage() {
    localStorage.clear();
}