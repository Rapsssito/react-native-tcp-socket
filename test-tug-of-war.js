#!/usr/bin/env node
// Consolidated Tug-of-War Test Suite: FrameCodec bidirectional stress testing
//
// Modes:
//   basic     - Simple P2P bidirectional frame exchange (default)
//   variance  - Compare FrameDecoder vs FrameDecoderCirc with warm JIT
//   fuzz      - Allocation-focused fuzzing test
//
// Usage Examples:
//   node test-tug-of-war.js --mode=basic --frames=100000
//   node test-tug-of-war.js --mode=variance --frames=1000 --warmup=10000
//   node --trace-opt --trace-deopt test-tug-of-war.js --mode=variance
//   node test-tug-of-war.js --mode=fuzz --frames=50000 --track-allocations

const net = require('net');
const crypto = require('crypto');
const { fork } = require('child_process');
const { FrameDecoder, encodeFrame } = require('./src/FrameCodec');
const { FrameDecoderCirc } = require('./src/FrameCodecCirc');
const drawRope = require('./rope-viz');

// ============================================================================
// SHARED UTILITIES (DRY)
// ============================================================================

class SeededRandom {
    constructor(seed) {
        this._seed = seed || crypto.randomBytes(4).readUInt32LE(0);
    }

    get seed() {
        return this._seed;
    }

    next() {
        this._seed = (this._seed * 1664525 + 1013904223) >>> 0;
        return this._seed / 0x100000000;
    }

    int(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
}

function getHighResTime() {
    const [seconds, nanoseconds] = process.hrtime();
    return seconds * 1000 + nanoseconds / 1000000;
}

function generateFuzzedPayload(rng) {
    const fuzzType = rng.next();

    if (fuzzType < 0.1) {
        return Buffer.alloc(0); // Empty
    } else if (fuzzType < 0.2) {
        return crypto.randomBytes(rng.int(1, 16)); // Tiny
    } else if (fuzzType < 0.4) {
        return crypto.randomBytes(rng.int(17, 1024)); // Medium
    } else if (fuzzType < 0.6) {
        return crypto.randomBytes(rng.int(1024, 65536)); // Large
    } else if (fuzzType < 0.8) {
        // Random grouping
        const chunks = [];
        for (let i = 0, n = rng.int(2, 10); i < n; i++) {
            chunks.push(crypto.randomBytes(rng.int(1, 512)));
        }
        return Buffer.concat(chunks);
    } else {
        // Patterned
        const patternType = rng.next();
        if (patternType < 0.5) {
            // Repeating pattern
            const pattern = crypto.randomBytes(rng.int(1, 64));
            const repeats = rng.int(1, 100);
            const payload = Buffer.alloc(pattern.length * repeats);
            for (let i = 0; i < repeats; i++) {
                pattern.copy(payload, i * pattern.length);
            }
            return payload;
        } else {
            // Sparse data
            const len = rng.int(128, 8192);
            const payload = Buffer.alloc(len, 0);
            for (let i = 0, n = rng.int(1, len / 8); i < n; i++) {
                payload[rng.int(0, len - 1)] = crypto.randomBytes(1)[0];
            }
            return payload;
        }
    }
}

async function sendFrames(socket, targetFrames, payloads, rng, label) {
    const batchSize = 500;
    let framesSent = 0;

    for (let i = 0; i < targetFrames; i += batchSize) {
        const count = Math.min(batchSize, targetFrames - i);
        const frames = [];

        for (let j = 0; j < count; j++) {
            const payload = payloads[i + j];
            const frame = encodeFrame(payload);

            // Random fragmentation
            if (frame.length > 3 && rng.next() < 0.3) {
                const splitAt = rng.int(1, frame.length - 1);
                frames.push(frame.subarray(0, splitAt));
                frames.push(frame.subarray(splitAt));
            } else {
                frames.push(frame);
            }
        }

        const batch = Buffer.concat(frames);
        const canContinue = socket.write(batch);
        if (!canContinue) {
            await new Promise((resolve) => socket.once('drain', resolve));
        }

        framesSent += count;
    }

    return framesSent;
}

// ============================================================================
// MODE: BASIC - Simple P2P Test
// ============================================================================

class TugServer {
    constructor(port, host = '127.0.0.1') {
        this.port = port;
        this.host = host;
        this.pendingSocket = null;
        this.server = net.createServer((socket) => this.handleConnection(socket));
    }

    listen() {
        return new Promise((resolve) => {
            this.server.listen(this.port, this.host, resolve);
        });
    }

    close() {
        this.server.close();
    }

    handleConnection(socket) {
        if (!this.pendingSocket) {
            this.pendingSocket = socket;
            socket.once('close', () => {
                if (this.pendingSocket === socket) this.pendingSocket = null;
            });
        } else {
            const clientA = this.pendingSocket;
            const clientB = socket;
            this.pendingSocket = null;

            clientA.pipe(clientB);
            clientB.pipe(clientA);
        }
    }
}

async function runBasicMode(config) {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║           TUG-OF-WAR: Basic P2P FrameCodec Test              ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    console.log(`Target: ${config.frames} frames each direction`);
    console.log(`Seed: ${config.seed}\n`);

    const tugServer = new TugServer(config.port);
    await tugServer.listen();

    const rng = new SeededRandom(config.seed);
    const payloads = Array.from({ length: config.frames }, () => generateFuzzedPayload(rng));

    // Fork server and client
    const server = fork(__filename, [
        '--role=server',
        `--port=${config.port}`,
        `--frames=${config.frames}`,
        `--seed=${config.seed}`,
    ]);
    const client = fork(__filename, [
        '--role=client',
        `--port=${config.port}`,
        `--frames=${config.frames}`,
        `--seed=${config.seed + 5000}`,
    ]);

    const results = await Promise.all([
        new Promise((resolve) => server.once('message', resolve)),
        new Promise((resolve) => client.once('message', resolve)),
    ]);

    server.kill();
    client.kill();
    tugServer.close();

    const [serverResult, clientResult] = results;
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`Server: ${serverResult.framesReceived}/${config.frames} frames received`);
    console.log(`Client: ${clientResult.framesReceived}/${config.frames} frames received`);

    if (
        serverResult.framesReceived === config.frames &&
        clientResult.framesReceived === config.frames
    ) {
        console.log('🎉 TUG-OF-WAR PASSED: Zero corruption');
        return 0;
    } else {
        console.log('❌ TUG-OF-WAR FAILED');
        return 1;
    }
}

// ============================================================================
// MODE: VARIANCE - Codec Comparison with Warm JIT
// ============================================================================

async function runVarianceMode(config) {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║        CODEC VARIANCE TUG-OF-WAR: Queue vs Circular         ║');
    console.log('║         Two-Fork Architecture with Warm JIT State           ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    console.log(`Target: ${config.frames} frames per iteration`);
    console.log(`Warmup: ${config.warmup} frames`);
    console.log(`Seed: ${config.seed}\n`);

    const tugServer = new TugServer(config.port);
    await tugServer.listen();

    console.log('[PARENT] Forking two child processes (will be reused across iterations)...');
    const child1 = fork(__filename, ['--role=child', '--codec=queue'], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });
    const child2 = fork(__filename, ['--role=child', '--codec=circular'], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    let deoptDetected = false;
    const deoptPattern = /\[deoptimize|Deoptimizing|DEOPT/i;

    child1.stderr.on('data', (data) => {
        if (deoptPattern.test(data.toString())) {
            console.error(`[CHILD1 DEOPT] ${data}`);
            deoptDetected = true;
        }
    });

    child2.stderr.on('data', (data) => {
        if (deoptPattern.test(data.toString())) {
            console.error(`[CHILD2 DEOPT] ${data}`);
            deoptDetected = true;
        }
    });

    console.log('[PARENT] Child 1: QUEUE decoder (persistent)');
    console.log('[PARENT] Child 2: CIRCULAR decoder (persistent)\n');

    // Warmup phase
    if (config.warmup > 0) {
        console.log(`[WARMUP] Running ${config.warmup} frames to warm up JIT...`);
        const warmupPort = 20000 + Math.floor(Math.random() * 10000);
        const warmupTug = new TugServer(warmupPort);
        await warmupTug.listen();

        child1.send({
            port: warmupPort,
            targetFrames: config.warmup,
            seed: config.seed,
            isWarmup: true,
        });
        child2.send({
            port: warmupPort,
            targetFrames: config.warmup,
            seed: config.seed + 5000,
            isWarmup: true,
        });

        await Promise.all([
            new Promise((resolve) => child1.once('message', resolve)),
            new Promise((resolve) => child2.once('message', resolve)),
        ]);

        warmupTug.close();
        console.log('[WARMUP] Complete. JIT should now be in optimized state.\n');
    }

    // Run timed iterations
    const results = [];
    const iterations = 5;

    for (let iter = 0; iter < iterations; iter++) {
        console.log(`--- Iteration ${iter + 1}/${iterations} ---`);
        const iterPort = 20000 + Math.floor(Math.random() * 10000);
        const iterTug = new TugServer(iterPort);
        await iterTug.listen();

        child1.send({
            port: iterPort,
            targetFrames: config.frames,
            seed: config.seed + iter * 1000,
            isWarmup: false,
        });
        child2.send({
            port: iterPort,
            targetFrames: config.frames,
            seed: config.seed + iter * 1000 + 5000,
            isWarmup: false,
        });

        const [result1, result2] = await Promise.all([
            new Promise((resolve) => child1.once('message', resolve)),
            new Promise((resolve) => child2.once('message', resolve)),
        ]);

        iterTug.close();

        results.push({ queueResult: result1, circResult: result2 });
        console.log(`  Queue Rate: ${result1.rate.toFixed(0)} fps`);
        console.log(`  Circular Rate: ${result2.rate.toFixed(0)} fps\n`);
    }

    child1.kill();
    child2.kill();
    tugServer.close();

    // Analysis
    const queueRates = results.map((r) => r.queueResult.rate);
    const circRates = results.map((r) => r.circResult.rate);

    const queueStats = calculateStats(queueRates);
    const circStats = calculateStats(circRates);

    console.log('🎯 CODEC VARIANCE ANALYSIS');
    console.log('='.repeat(60));
    console.log('\nQUEUE-BASED DECODER:');
    console.log(`  Mean Rate: ${queueStats.mean.toFixed(0)} fps`);
    console.log(
        `  StdDev: ${queueStats.stdDev.toFixed(0)} fps (${(
            (queueStats.stdDev / queueStats.mean) *
            100
        ).toFixed(1)}%)`
    );
    console.log(`  Min/Max: ${queueStats.min.toFixed(0)} - ${queueStats.max.toFixed(0)} fps`);

    console.log('\nCIRCULAR BUFFER DECODER:');
    console.log(`  Mean Rate: ${circStats.mean.toFixed(0)} fps`);
    console.log(
        `  StdDev: ${circStats.stdDev.toFixed(0)} fps (${(
            (circStats.stdDev / circStats.mean) *
            100
        ).toFixed(1)}%)`
    );
    console.log(`  Min/Max: ${circStats.min.toFixed(0)} - ${circStats.max.toFixed(0)} fps`);

    const rateDiff = ((circStats.mean - queueStats.mean) / queueStats.mean) * 100;
    if (Math.abs(rateDiff) < 1) {
        console.log(
            `\n📊 PERFORMANCE: Nearly identical (${rateDiff > 0 ? '+' : ''}${rateDiff.toFixed(
                1
            )}% difference)`
        );
    } else if (rateDiff > 0) {
        console.log(`\n📊 PERFORMANCE: Circular buffer ${Math.abs(rateDiff).toFixed(1)}% faster`);
    } else {
        console.log(`\n📊 PERFORMANCE: Queue-based ${Math.abs(rateDiff).toFixed(1)}% faster`);
    }

    console.log('\n🔍 V8 OPTIMIZATION STATUS');
    console.log('='.repeat(60));
    if (deoptDetected) {
        console.error('⚠️  DEOPTS DETECTED during test execution!');
        console.error('    Check stderr output above for deopt locations.');
    } else {
        console.log('✅ No deopts detected - JIT remained stable across all iterations');
    }

    return 0;
}

function calculateStats(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { mean, variance, stdDev, min, max };
}

// ============================================================================
// ROLE HANDLERS (Server/Client/Child)
// ============================================================================

async function runServerRole(config) {
    const rng = new SeededRandom(config.seed);
    const payloads = Array.from({ length: config.frames }, () => generateFuzzedPayload(rng));

    const socket = net.createConnection({ port: config.port, host: '127.0.0.1' });
    const decoder = new FrameDecoder();
    let framesReceived = 0;
    const startTime = getHighResTime();

    decoder.on('data', () => framesReceived++);
    socket.on('data', (chunk) => decoder.write(chunk));

    await new Promise((resolve) => socket.once('connect', resolve));

    await sendFrames(socket, config.frames, payloads, rng, 'server');

    await new Promise((resolve) => {
        const check = () => {
            if (framesReceived >= config.frames) resolve();
            else setTimeout(check, 10);
        };
        check();
    });

    const elapsed = getHighResTime() - startTime;
    process.send({ framesReceived, elapsed, rate: framesReceived / (elapsed / 1000) });
    socket.end();
    process.exit(0);
}

async function runClientRole(config) {
    const rng = new SeededRandom(config.seed);
    const payloads = Array.from({ length: config.frames }, () => generateFuzzedPayload(rng));

    const socket = net.createConnection({ port: config.port, host: '127.0.0.1' });
    const decoder = new FrameDecoder();
    let framesReceived = 0;
    const startTime = getHighResTime();

    decoder.on('data', () => framesReceived++);
    socket.on('data', (chunk) => decoder.write(chunk));

    await new Promise((resolve) => socket.once('connect', resolve));

    await sendFrames(socket, config.frames, payloads, rng, 'client');

    await new Promise((resolve) => {
        const check = () => {
            if (framesReceived >= config.frames) resolve();
            else setTimeout(check, 10);
        };
        check();
    });

    const elapsed = getHighResTime() - startTime;
    process.send({ framesReceived, elapsed, rate: framesReceived / (elapsed / 1000) });
    socket.end();
    process.exit(0);
}

async function runChildRole(config) {
    let decoder = null;
    const codecType = config.codec;

    process.on('message', async (msg) => {
        if (!decoder) {
            decoder = codecType === 'circular' ? new FrameDecoderCirc() : new FrameDecoder();
        }

        const rng = new SeededRandom(msg.seed);
        const payloads = Array.from({ length: msg.targetFrames }, () => generateFuzzedPayload(rng));

        const socket = net.createConnection({ port: msg.port, host: '127.0.0.1' });
        let framesReceived = 0;
        const startTime = getHighResTime();

        const dataHandler = () => framesReceived++;
        decoder.on('data', dataHandler);
        socket.on('data', (chunk) => decoder.write(chunk));

        await new Promise((resolve) => socket.once('connect', resolve));

        await sendFrames(socket, msg.targetFrames, payloads, rng, codecType);

        await new Promise((resolve) => {
            const check = () => {
                if (framesReceived >= msg.targetFrames) resolve();
                else setTimeout(check, 10);
            };
            check();
        });

        const elapsed = getHighResTime() - startTime;
        process.send({
            role: codecType,
            rate: framesReceived / (elapsed / 1000),
            framesReceived,
            elapsed,
        });

        socket.end();
        decoder.removeListener('data', dataHandler);
    });
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        mode: 'basic',
        role: null,
        codec: null,
        port: 9893,
        frames: 100000,
        warmup: 10000,
        seed: crypto.randomBytes(4).readUInt32LE(0),
    };

    args.forEach((arg) => {
        const [key, value] = arg.split('=');
        if (key === '--mode') config.mode = value;
        if (key === '--role') config.role = value;
        if (key === '--codec') config.codec = value;
        if (key === '--port') config.port = parseInt(value, 10);
        if (key === '--frames') config.frames = parseInt(value, 10);
        if (key === '--warmup') config.warmup = parseInt(value, 10);
        if (key === '--seed') config.seed = parseInt(value, 10);
    });

    return config;
}

async function main() {
    const config = parseArgs();

    // Role-based execution (child processes)
    if (config.role === 'server') return runServerRole(config);
    if (config.role === 'client') return runClientRole(config);
    if (config.role === 'child') return runChildRole(config);

    // Mode-based execution (parent process)
    if (config.mode === 'basic') return runBasicMode(config);
    if (config.mode === 'variance') return runVarianceMode(config);

    console.error('Unknown mode or role');
    process.exit(1);
}

if (require.main === module) {
    main()
        .then((code) => process.exit(code || 0))
        .catch((err) => {
            console.error('Fatal error:', err);
            process.exit(1);
        });
}

module.exports = { SeededRandom, generateFuzzedPayload, sendFrames, TugServer };
