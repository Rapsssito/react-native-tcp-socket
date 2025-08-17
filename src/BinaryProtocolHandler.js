/**
 * Binary Protocol Handler for libp2p Compatibility
 * 
 * Handles binary protocol data integrity and multistream-select message format
 * for react-native-tcp-socket → libp2p compatibility
 * 
 * Task: task_1755445933031 ($300 BountyHub)
 * Issue: UnexpectedEOFError in multistream-select protocol negotiation
 * Created: 17 августа 2025
 */

'use strict';

/**
 * Utility class for handling binary protocol data and multistream-select messages
 * with guaranteed data integrity through React Native bridge transfers
 */
export class BinaryProtocolHandler {
    /**
     * Validates binary data integrity after base64 round-trip conversion
     * Critical for preventing data corruption in protocol-sensitive applications
     * 
     * @param {Buffer} originalBuffer - Original binary data
     * @param {Buffer} receivedBuffer - Data received after base64 conversion
     * @returns {boolean} True if data integrity maintained
     */
    static validateBinaryIntegrity(originalBuffer, receivedBuffer) {
        if (!Buffer.isBuffer(originalBuffer) || !Buffer.isBuffer(receivedBuffer)) {
            return false;
        }
        return originalBuffer.equals(receivedBuffer);
    }

    /**
     * Creates a multistream-select protocol message in the exact format expected by libp2p
     * Format: [length_byte][protocol_string][newline]
     * 
     * @param {string} protocol - Protocol identifier (e.g., '/multistream-select/0.3.0')
     * @returns {Buffer} Properly formatted multistream-select message
     */
    static createMultistreamSelectMessage(protocol) {
        if (typeof protocol !== 'string') {
            throw new TypeError('Protocol must be a string');
        }

        // Create protocol message with newline termination (libp2p requirement)
        const protocolMessage = `${protocol}\n`;
        const messageBuffer = Buffer.from(protocolMessage, 'utf8');
        
        // Multistream-select uses single-byte length prefix for messages up to 255 bytes
        if (messageBuffer.length > 255) {
            throw new Error(`Protocol message too long: ${messageBuffer.length} bytes (max 255)`);
        }

        // Create length prefix (single byte)
        const lengthBuffer = Buffer.allocUnsafe(1);
        lengthBuffer.writeUInt8(messageBuffer.length, 0);

        // Combine length prefix + message
        return Buffer.concat([lengthBuffer, messageBuffer]);
    }

    /**
     * Parses a multistream-select protocol message from binary data
     * Handles partial messages and provides remaining buffer
     * 
     * @param {Buffer} buffer - Raw binary data from network
     * @returns {Object|null} Parsed message with protocol and remaining data, or null if incomplete
     */
    static parseMultistreamSelectMessage(buffer) {
        if (!Buffer.isBuffer(buffer) || buffer.length < 1) {
            return null;
        }

        // Read message length from first byte
        const messageLength = buffer.readUInt8(0);

        // Check if we have complete message
        if (buffer.length < messageLength + 1) {
            return null; // Incomplete message, need more data
        }

        // Extract message content (skip length byte)
        const messageBuffer = buffer.slice(1, messageLength + 1);
        const protocolWithNewline = messageBuffer.toString('utf8');
        
        // Remove trailing newline (multistream-select format requirement)
        const protocol = protocolWithNewline.replace(/\n$/, '');

        // Return any remaining data for next message
        const remaining = buffer.slice(messageLength + 1);

        return {
            protocol,
            remaining,
            messageLength
        };
    }

    /**
     * Creates a multistream-select response message (for server-side usage)
     * 
     * @param {string} protocol - Supported protocol or 'na' for not available
     * @returns {Buffer} Formatted response message
     */
    static createMultistreamSelectResponse(protocol) {
        return this.createMultistreamSelectMessage(protocol);
    }

    /**
     * Detects if buffer contains multistream-select protocol data
     * Useful for protocol-aware message routing
     * 
     * @param {Buffer} buffer - Binary data to analyze
     * @returns {boolean} True if appears to be multistream-select format
     */
    static isMultistreamSelectMessage(buffer) {
        if (!Buffer.isBuffer(buffer) || buffer.length < 2) {
            return false;
        }

        const messageLength = buffer.readUInt8(0);
        
        // Basic validation: reasonable message length and format
        if (messageLength === 0 || messageLength > 100 || buffer.length < messageLength + 1) {
            return false;
        }

        // Check if message contains protocol-like content
        const messageContent = buffer.slice(1, messageLength + 1).toString('utf8');
        return messageContent.includes('/') && messageContent.endsWith('\n');
    }

    /**
     * Ensures binary data can survive base64 round-trip conversion
     * React Native bridge requires base64 encoding for binary data transfer
     * 
     * @param {Buffer} data - Binary data to validate
     * @returns {Object} Validation result with integrity check
     */
    static ensureBinaryIntegrity(data) {
        if (!Buffer.isBuffer(data)) {
            throw new TypeError('Data must be a Buffer');
        }

        // Simulate RN bridge conversion: binary → base64 → binary
        const base64String = data.toString('base64');
        const reconvertedBuffer = Buffer.from(base64String, 'base64');

        const isIntact = data.equals(reconvertedBuffer);

        return {
            original: data,
            reconverted: reconvertedBuffer,
            base64: base64String,
            integrityMaintained: isIntact,
            size: data.length
        };
    }

    /**
     * Creates a buffer with safe binary content for protocol messages
     * Optimized for React Native bridge compatibility
     * 
     * @param {string|Buffer|Uint8Array} input - Input data
     * @param {string} encoding - Encoding for string input (default: 'utf8')
     * @returns {Buffer} Safe binary buffer
     */
    static createSafeBinaryBuffer(input, encoding = 'utf8') {
        let buffer;

        if (typeof input === 'string') {
            buffer = Buffer.from(input, encoding);
        } else if (Buffer.isBuffer(input)) {
            buffer = input;
        } else if (input instanceof Uint8Array || Array.isArray(input)) {
            buffer = Buffer.from(input);
        } else {
            throw new TypeError('Input must be string, Buffer, Uint8Array, or Array');
        }

        // Validate round-trip integrity
        const integrityCheck = this.ensureBinaryIntegrity(buffer);
        if (!integrityCheck.integrityMaintained) {
            console.warn('Warning: Binary data may be corrupted through base64 conversion');
        }

        return buffer;
    }

    /**
     * Debug utility: Formats binary data for human-readable logging
     * Useful for troubleshooting protocol negotiation issues
     * 
     * @param {Buffer} buffer - Binary data to format
     * @param {number} maxBytes - Maximum bytes to display (default: 50)
     * @returns {string} Formatted debug string
     */
    static formatBinaryForDebug(buffer, maxBytes = 50) {
        if (!Buffer.isBuffer(buffer)) {
            return 'Not a Buffer';
        }

        const truncated = buffer.slice(0, maxBytes);
        const hex = truncated.toString('hex').match(/.{2}/g)?.join(' ') || '';
        const ascii = truncated.toString('ascii').replace(/[^\x20-\x7E]/g, '.');

        const truncatedSuffix = buffer.length > maxBytes ? '...' : '';
        
        return `Buffer(${buffer.length}): ${hex}${truncatedSuffix} | ASCII: ${ascii}${truncatedSuffix}`;
    }
}

/**
 * Default export for CommonJS compatibility
 */
export default BinaryProtocolHandler;