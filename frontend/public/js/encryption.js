// frontend/src/js/encryption.js
import { arrayBufferToBase64, base64ToArrayBuffer, truncate } from './utils.js';

export class EncryptionService {
    
    // Generate RSA key pair
    async generateKeyPair() {
        const kp = await crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256'
            },
            true,
            ['encrypt', 'decrypt']
        );
        
        return {
            publicKey: arrayBufferToBase64(await crypto.subtle.exportKey('spki', kp.publicKey)),
            privateKey: arrayBufferToBase64(await crypto.subtle.exportKey('pkcs8', kp.privateKey))
        };
    }
    
    // Encrypt private key with password (for server storage)
    async encryptPrivateKeyWithPassword(privateKeyB64, password) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const aesKey = await this._deriveKey(password, salt);
        const enc = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            new TextEncoder().encode(privateKeyB64)
        );
        return {
            encryptedPrivateKey: arrayBufferToBase64(enc),
            salt: arrayBufferToBase64(salt),
            iv: arrayBufferToBase64(iv)
        };
    }
    
    // Decrypt private key with password
    async decryptPrivateKeyWithPassword(encryptedData, password) {
        const aesKey = await this._deriveKey(password, base64ToArrayBuffer(encryptedData.salt));
        const dec = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: base64ToArrayBuffer(encryptedData.iv) },
            aesKey,
            base64ToArrayBuffer(encryptedData.encryptedPrivateKey)
        );
        return new TextDecoder().decode(dec);
    }
    
    // Derive AES key from password
    async _deriveKey(password, salt) {
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }
    
    // Encrypt a single message for a recipient
    async encryptMessage(message, publicKeyB64) {
        const pubKey = await this._importPublicKey(publicKeyB64);
        const aesKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            new TextEncoder().encode(message)
        );
        const rawAes = await crypto.subtle.exportKey('raw', aesKey);
        const encAesKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, rawAes);
        const encB64 = arrayBufferToBase64(enc);
        
        console.log(`🔒 Encrypted: ${truncate(encB64)}`);
        
        return {
            encryptedMessage: encB64,
            encryptedAesKey: arrayBufferToBase64(encAesKey),
            iv: arrayBufferToBase64(iv)
        };
    }
    
    // Dual encrypt for both recipient and sender
    async encryptMessageDual(message, recipientPubKey, senderPubKey) {
        const [forRecipient, forSender] = await Promise.all([
            this.encryptMessage(message, recipientPubKey),
            this.encryptMessage(message, senderPubKey)
        ]);
        return { forRecipient, forSender };
    }
    
    // Decrypt a message
    async decryptMessage(encryptedData, privateKeyB64) {
        const privKey = await this._importPrivateKey(privateKeyB64);
        const rawAes = await crypto.subtle.decrypt(
            { name: 'RSA-OAEP' },
            privKey,
            base64ToArrayBuffer(encryptedData.encryptedAesKey)
        );
        const aesKey = await crypto.subtle.importKey(
            'raw',
            rawAes,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );
        const dec = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: base64ToArrayBuffer(encryptedData.iv) },
            aesKey,
            base64ToArrayBuffer(encryptedData.encryptedMessage)
        );
        return new TextDecoder().decode(dec);
    }
    
    async _importPublicKey(b64) {
        return crypto.subtle.importKey(
            'spki',
            base64ToArrayBuffer(b64),
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            false,
            ['encrypt']
        );
    }
    
    async _importPrivateKey(b64) {
        return crypto.subtle.importKey(
            'pkcs8',
            base64ToArrayBuffer(b64),
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            false,
            ['decrypt']
        );
    }
}