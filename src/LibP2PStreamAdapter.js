/**
 * LibP2P Stream Adapter for react-native-tcp-socket
 * 
 * Provides Node.js Stream interface compatibility over react-native-tcp-socket
 * for seamless integration with libp2p networking stack
 * 
 * Task: task_1755445933031 ($300 BountyHub)
 * Issue: UnexpectedEOFError in multistream-select protocol negotiation
 * Created: 17 августа 2025
 */

'use strict';

import { BinaryProtocolHandler } from './BinaryProtocolHandler.js';

/**
 * Stream adapter that bridges react-native-tcp-socket EventEmitter API
 * to Node.js Stream interface required by libp2p and it-* libraries
 */
export class LibP2PStreamAdapter {
    /**
     * Create a new libp2p-compatible stream wrapper
     * 
     * @param {Socket} socket - react-native-tcp-socket Socket instance
     * @param {Object} options - Configuration options
     */
    constructor(socket, options = {}) {
        if (!socket) {
            throw new Error('Socket is required');
        }

        this.socket = socket;
        this.options = {
            // Buffer management
            readBufferSize: options.readBufferSize || 65536, // 64KB default
            writeBufferSize: options.writeBufferSize || 65536,
            
            // Protocol handling
            enableProtocolDetection: options.enableProtocolDetection !== false,
            enableBinaryValidation: options.enableBinaryValidation !== false,
            
            // Debug options
            debug: options.debug || false,
            ...options
        };

        // Stream state
        this.readBuffer = Buffer.alloc(0);
        this.closed = false;
        this.destroyed = false;
        this.reading = false;
        
        // Read queue management
        this.readPromises = [];
        this.currentReadRequest = null;
        
        // Write queue management  
        this.writePromises = [];
        this.writeInProgress = false;
        
        // Event handling
        this.boundHandlers = {
            handleBinaryData: this.handleBinaryData.bind(this),
            handleClose: this.handleClose.bind(this),
            handleError: this.handleError.bind(this),
            handleConnect: this.handleConnect.bind(this)
        };

        this.setupEventHandlers();
        this.logDebug('LibP2PStreamAdapter created');
    }

    /**
     * Set up event listeners on the underlying socket
     * Uses 'binaryData' event for clean binary handling (will be added to Socket.js)
     */
    setupEventHandlers() {
        // Primary data handler - use enhanced binary event
        if (this.socket.on) {
            this.socket.on('binaryData', this.boundHandlers.handleBinaryData);
            this.socket.on('data', this.boundHandlers.handleBinaryData); // Fallback for existing API
            this.socket.on('close', this.boundHandlers.handleClose);
            this.socket.on('error', this.boundHandlers.handleError);
            this.socket.on('connect', this.boundHandlers.handleConnect);
        }
    }

    /**
     * Clean up event listeners
     */
    removeEventHandlers() {
        if (this.socket.removeListener) {
            this.socket.removeListener('binaryData', this.boundHandlers.handleBinaryData);
            this.socket.removeListener('data', this.boundHandlers.handleBinaryData);
            this.socket.removeListener('close', this.boundHandlers.handleClose);
            this.socket.removeListener('error', this.boundHandlers.handleError);
            this.socket.removeListener('connect', this.boundHandlers.handleConnect);
        }
    }

    /**
     * Handle incoming binary data from socket
     * Accumulates data in read buffer and processes pending read requests
     * 
     * @param {Buffer} data - Incoming binary data
     */
    handleBinaryData(data) {
        if (this.closed || this.destroyed) {
            return;
        }

        // Ensure we have a Buffer (handle both 'data' and 'binaryData' events)
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        
        this.logDebug(`Received ${buffer.length} bytes:`, BinaryProtocolHandler.formatBinaryForDebug(buffer));
        
        // Binary integrity check (if enabled)
        if (this.options.enableBinaryValidation) {
            const integrity = BinaryProtocolHandler.ensureBinaryIntegrity(buffer);
            if (!integrity.integrityMaintained) {
                console.warn('Binary data integrity issue detected');
            }
        }

        // Accumulate in read buffer
        this.readBuffer = Buffer.concat([this.readBuffer, buffer]);
        
        // Process any pending read requests
        this.processReadQueue();
    }

    /**
     * Handle socket connection event
     */
    handleConnect() {
        this.logDebug('Socket connected');
    }

    /**
     * Handle socket close event
     * 
     * @param {boolean} hadError - Whether close was due to error
     */
    handleClose(hadError) {
        this.logDebug('Socket closed, hadError:', hadError);
        this.closed = true;
        
        // Reject all pending reads with EOF
        this.rejectPendingReads(new Error('Stream ended'));
        
        // Reject all pending writes
        this.rejectPendingWrites(new Error('Stream closed'));
    }

    /**
     * Handle socket error event
     * 
     * @param {Error} error - Error that occurred
     */
    handleError(error) {
        this.logDebug('Socket error:', error.message);
        
        // Reject pending operations with the error
        this.rejectPendingReads(error);
        this.rejectPendingWrites(error);
    }

    /**
     * Read data from the stream (Node.js Stream interface method)
     * Core method required by libp2p and it-* libraries
     * 
     * @param {number} length - Number of bytes to read (0 = read available)
     * @returns {Promise<Buffer>} Promise resolving to read data
     */
    async read(length = 0) {
        if (this.closed || this.destroyed) {
            throw new Error('Cannot read from closed stream');
        }

        this.logDebug(`Read request: ${length} bytes (buffer has ${this.readBuffer.length})`);

        return new Promise((resolve, reject) => {
            const readRequest = {
                length: length || this.readBuffer.length || 1, // Default to 1 byte minimum
                resolve,
                reject,
                timestamp: Date.now()
            };

            // If we have enough data, fulfill immediately
            if (this.readBuffer.length >= readRequest.length) {
                const result = this.readBuffer.slice(0, readRequest.length);
                this.readBuffer = this.readBuffer.slice(readRequest.length);
                
                this.logDebug(`Read fulfilled immediately: ${result.length} bytes`);
                resolve(result);
            } else {
                // Queue the read request
                this.readPromises.push(readRequest);
                this.logDebug(`Read queued: ${this.readPromises.length} pending requests`);
            }
        });
    }

    /**
     * Write data to the stream (Node.js Stream interface method)
     * 
     * @param {Buffer|string|Uint8Array} data - Data to write
     * @returns {Promise<void>} Promise resolving when write completes
     */
    async write(data) {
        if (this.closed || this.destroyed) {
            throw new Error('Cannot write to closed stream');
        }

        // Convert data to Buffer safely
        const buffer = BinaryProtocolHandler.createSafeBinaryBuffer(data);
        
        this.logDebug(`Write request: ${buffer.length} bytes:`, BinaryProtocolHandler.formatBinaryForDebug(buffer));

        return new Promise((resolve, reject) => {
            const writeRequest = {
                data: buffer,
                resolve,
                reject,
                timestamp: Date.now()
            };

            this.writePromises.push(writeRequest);
            this.processWriteQueue();
        });
    }

    /**
     * Close the stream gracefully
     * 
     * @returns {Promise<void>} Promise resolving when close completes
     */
    async close() {
        if (this.closed) {
            return;
        }

        this.logDebug('Closing stream');
        this.closed = true;

        // Clean up event handlers
        this.removeEventHandlers();

        // Reject all pending operations
        this.rejectPendingReads(new Error('Stream closed'));
        this.rejectPendingWrites(new Error('Stream closed'));

        // Close underlying socket
        if (this.socket && this.socket.end) {
            this.socket.end();
        }
    }

    /**
     * Destroy the stream immediately
     * 
     * @returns {Promise<void>} Promise resolving when destroy completes
     */
    async destroy() {
        if (this.destroyed) {
            return;
        }

        this.logDebug('Destroying stream');
        this.destroyed = true;
        this.closed = true;

        // Clean up event handlers
        this.removeEventHandlers();

        // Reject all pending operations
        this.rejectPendingReads(new Error('Stream destroyed'));
        this.rejectPendingWrites(new Error('Stream destroyed'));

        // Destroy underlying socket
        if (this.socket && this.socket.destroy) {
            this.socket.destroy();
        }
    }

    /**
     * Async iterator interface (required for it-* libraries)
     * This is critical for libp2p compatibility
     * 
     * @yields {Buffer} Chunks of data from the stream
     */
    async *[Symbol.asyncIterator]() {
        this.logDebug('Starting async iteration');
        
        try {
            while (!this.closed && !this.destroyed) {
                try {
                    // Read available data or wait for more
                    const chunkSize = Math.max(1, Math.min(this.readBuffer.length, 8192));
                    const chunk = await this.read(chunkSize);
                    
                    if (chunk.length === 0) {
                        // End of stream
                        break;
                    }
                    
                    this.logDebug(`Yielding chunk: ${chunk.length} bytes`);
                    yield chunk;
                } catch (error) {
                    if (this.closed || this.destroyed) {
                        // Expected during close
                        break;
                    }
                    throw error;
                }
            }
        } finally {
            this.logDebug('Async iteration ended');
        }
    }

    /**
     * Process queued read requests against available buffer data
     */
    processReadQueue() {
        while (this.readPromises.length > 0 && this.readBuffer.length > 0) {
            const request = this.readPromises[0];
            
            if (this.readBuffer.length >= request.length) {
                // Fulfill the read request
                this.readPromises.shift();
                
                const result = this.readBuffer.slice(0, request.length);
                this.readBuffer = this.readBuffer.slice(request.length);
                
                this.logDebug(`Read fulfilled from queue: ${result.length} bytes`);
                request.resolve(result);
            } else {
                // Not enough data yet, wait for more
                break;
            }
        }
    }

    /**
     * Process queued write requests to underlying socket
     */
    processWriteQueue() {
        if (this.writeInProgress || this.writePromises.length === 0) {
            return;
        }

        this.writeInProgress = true;
        const writeRequest = this.writePromises.shift();

        // Use socket.write with callback
        try {
            const success = this.socket.write(writeRequest.data, (error) => {
                this.writeInProgress = false;
                
                if (error) {
                    this.logDebug(`Write failed:`, error.message);
                    writeRequest.reject(error);
                } else {
                    this.logDebug(`Write completed: ${writeRequest.data.length} bytes`);
                    writeRequest.resolve();
                }

                // Process next write in queue
                this.processWriteQueue();
            });

            // Handle immediate drain requirement
            if (!success && this.socket.writableNeedDrain) {
                this.socket.once('drain', () => {
                    this.logDebug('Socket drained, continuing writes');
                });
            }

        } catch (error) {
            this.writeInProgress = false;
            writeRequest.reject(error);
            this.processWriteQueue();
        }
    }

    /**
     * Reject all pending read requests with given error
     * 
     * @param {Error} error - Error to reject with
     */
    rejectPendingReads(error) {
        while (this.readPromises.length > 0) {
            const request = this.readPromises.shift();
            request.reject(error);
        }
    }

    /**
     * Reject all pending write requests with given error
     * 
     * @param {Error} error - Error to reject with  
     */
    rejectPendingWrites(error) {
        while (this.writePromises.length > 0) {
            const request = this.writePromises.shift();
            request.reject(error);
        }
    }

    /**
     * Debug logging utility
     * 
     * @param {...any} args - Arguments to log
     */
    logDebug(...args) {
        if (this.options.debug) {
            console.log(`[LibP2PStreamAdapter]`, ...args);
        }
    }

    /**
     * Get current stream status for debugging
     * 
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            closed: this.closed,
            destroyed: this.destroyed,
            reading: this.reading,
            readBufferSize: this.readBuffer.length,
            pendingReads: this.readPromises.length,
            pendingWrites: this.writePromises.length,
            writeInProgress: this.writeInProgress,
            socketConnected: this.socket?.readyState === 'open'
        };
    }
}

/**
 * Default export for CommonJS compatibility
 */
export default LibP2PStreamAdapter;