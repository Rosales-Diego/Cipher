import { createCipheriv, createDecipheriv, randomBytes, scryptSync, generateKeyPairSync, publicEncrypt, privateDecrypt, constants } from 'crypto';
import { createReadStream, createWriteStream, statSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import path from 'path';

export const activeControllers = new Map<string, AbortController>();

export function getDirSize(dirPath: string): number {
    let size = 0;
    const files = readdirSync(dirPath, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        if (file.isDirectory()) size += getDirSize(fullPath);
        else size += statSync(fullPath).size;
    }
    return size;
}

// ---------------------------------------------------------
// ASYMMETRIC RECOVERY SYSTEM (RSA)
// ---------------------------------------------------------

export function generateRecoveryData(answersString: string) {
    // 1. Generating RSA Key Pair
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    // 2. Encrypting the Private Key using the user's answers
    const salt = randomBytes(16);
    const key = scryptSync(answersString, salt, 32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(Buffer.from(privateKey, 'utf8')), cipher.final()]);
    const tag = cipher.getAuthTag();

    // 3. Returning the Public Key intact, and the Private Key encrypted
    return {
        publicKey,
        encPrivateKey: enc.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        salt: salt.toString('base64')
    };
}

export function getPrivateKey(answersString: string, recoveryData: any): string {
    const key = scryptSync(answersString, Buffer.from(recoveryData.salt, 'base64'), 32);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(recoveryData.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(recoveryData.tag, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(recoveryData.encPrivateKey, 'base64')), decipher.final()]);
    return dec.toString('utf8');
}

// ---------------------------------------------------------
// FILE ENCRYPTION AND DECRYPTION
// ---------------------------------------------------------

function encryptKey(keyToEncrypt: Buffer, encryptionString: string, salt: Buffer): { iv: Buffer, enc: Buffer, tag: Buffer } {
    const encKey = scryptSync(encryptionString, salt, 32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encKey, iv);
    const enc = Buffer.concat([cipher.update(keyToEncrypt), cipher.final()]);
    return { iv, enc, tag: cipher.getAuthTag() };
}

function decryptKey(encKey: Buffer, iv: Buffer, tag: Buffer, decryptionString: string, salt: Buffer): Buffer {
    const decKey = scryptSync(decryptionString, salt, 32);
    const decipher = createDecipheriv('aes-256-gcm', decKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encKey), decipher.final()]);
}

export async function encryptFile(filePath: string, password: string, publicKey: string, onProgress: (p: number) => void, abortId: string): Promise<string> {
    const isDir = statSync(filePath).isDirectory();
    const parsedPath = path.parse(filePath);

    let outPath = path.join(parsedPath.dir, parsedPath.name + '.cipher');
    let counter = 1;
    while (existsSync(outPath) && outPath !== filePath) {
        outPath = path.join(parsedPath.dir, `${parsedPath.name}_${counter}.cipher`);
        counter++;
    }

    const ac = new AbortController();
    activeControllers.set(abortId, ac);

    const fileSalt = randomBytes(16);
    const fileKey = randomBytes(32);
    const passWrap = encryptKey(fileKey, password, fileSalt);

    // Asymmetric Lock (RSA): Encrypting the fileKey with the Public Key
    const qaWrapEnc = publicEncrypt({
        key: publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
    }, fileKey);

    const fileIv = randomBytes(16);

    const originalNameBuf = Buffer.from(parsedPath.base, 'utf-8');
    const nameLenBuf = Buffer.alloc(2);
    nameLenBuf.writeUInt16LE(originalNameBuf.length, 0);

    // HEADER STRUCTURE (351 bytes) + Original Name
    const header = Buffer.concat([
        fileSalt,                                // 16 bytes
        Buffer.from([isDir ? 1 : 0]),            // 1 byte
        passWrap.iv, passWrap.enc, passWrap.tag, // 12 + 32 + 16 = 60 bytes
        qaWrapEnc,                               // 256 bytes (RSA)
        fileIv,                                  // 16 bytes
        nameLenBuf,                              // 2 bytes
        originalNameBuf                          // N bytes
    ]);

    const cipher = createCipheriv('aes-256-ctr', fileKey, fileIv);
    const writeStream = createWriteStream(outPath);
    writeStream.write(header);

    const progressTracker = new Transform({
        transform(chunk, _, callback) {
            onProgress(chunk.length);
            callback(null, chunk);
        }
    });

    try {
        if (isDir) {
            const archive = archiver('zip', { zlib: { level: 0 } });
            const pipePromise = pipeline(archive, cipher, progressTracker, writeStream, { signal: ac.signal });
            archive.directory(filePath, false);
            archive.finalize();
            await pipePromise;
        } else {
            await pipeline(createReadStream(filePath), cipher, progressTracker, writeStream, { signal: ac.signal });
        }
        return outPath;
    } catch (err: any) {
        if (existsSync(outPath)) unlinkSync(outPath);
        if (err.name === 'AbortError') throw new Error('CANCELLED');
        throw err;
    } finally {
        activeControllers.delete(abortId);
    }
}

export async function decryptFile(filePath: string, secret: string, method: 'password' | 'qa', restore: boolean, tempDir?: string, onProgress?: (p: number) => void, abortId?: string, recoveryData?: any): Promise<string> {
    const ac = new AbortController();
    if (abortId) activeControllers.set(abortId, ac);

    // Reading the 351 fixed bytes of the header
    const readHeaderStream = createReadStream(filePath, { end: 350 });
    const header = await new Promise<Buffer>((resolve, reject) => {
        readHeaderStream.on('data', (chunk) => resolve(chunk as Buffer));
        readHeaderStream.on('error', reject);
    });

    if (header.length < 351) throw new Error("Archivo corrupto.");

    const fileSalt = header.subarray(0, 16);
    const isDir = header.readUInt8(16) === 1;

    const passIv = header.subarray(17, 29);
    const passEnc = header.subarray(29, 61);
    const passTag = header.subarray(61, 77);

    const qaWrapEnc = header.subarray(77, 333); // 256 bytes RSA

    const fileIv = header.subarray(333, 349);
    const nameLen = header.readUInt16LE(349);

    const headerTotalLength = 351 + nameLen;
    let fullHeader = header;
    if (header.length < headerTotalLength) {
        const remainder = await new Promise<Buffer>((resolve) => {
            const s = createReadStream(filePath, { start: header.length, end: headerTotalLength - 1 });
            s.on('data', (chunk) => resolve(chunk as Buffer));
        });
        fullHeader = Buffer.concat([header, remainder]);
    }

    const originalName = fullHeader.subarray(351, 351 + nameLen).toString('utf-8');

    let fileKey: Buffer;
    try {
        if (method === 'password') {
            fileKey = decryptKey(passEnc, passIv, passTag, secret, fileSalt);
        } else {
            if (!recoveryData) throw new Error("Faltan datos de recuperación");
            const privateKeyPem = getPrivateKey(secret, recoveryData);
            fileKey = privateDecrypt({
                key: privateKeyPem,
                padding: constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: "sha256",
            }, qaWrapEnc);
        }
    } catch (e) {
        throw new Error("Contraseña o respuestas incorrectas.");
    }

    const decipher = createDecipheriv('aes-256-ctr', fileKey, fileIv);
    const parsedPath = path.parse(filePath);

    const targetDirectory = (!restore && tempDir) ? tempDir : parsedPath.dir;
    let outPath = path.join(targetDirectory, originalName);

    let counter = 1;
    while (restore && existsSync(outPath)) {
        const pPath = path.parse(originalName);
        outPath = path.join(targetDirectory, `${pPath.name}_${counter}${pPath.ext}`);
        counter++;
    }

    const tempZipPath = outPath + '.temp.zip';
    const writeTarget = isDir ? tempZipPath : outPath;

    const readStream = createReadStream(filePath, { start: headerTotalLength });

    const progressTracker = new Transform({
        transform(chunk, _, callback) {
            if (onProgress) onProgress(chunk.length);
            callback(null, chunk);
        }
    });

    try {
        await pipeline(readStream, decipher, progressTracker, createWriteStream(writeTarget), { signal: ac.signal });
        if (isDir) {
            const zip = new AdmZip(tempZipPath);
            zip.extractAllTo(outPath, true);
            unlinkSync(tempZipPath);
        }
        return outPath;
    } catch (err: any) {
        if (existsSync(writeTarget)) unlinkSync(writeTarget);
        if (isDir && existsSync(tempZipPath)) unlinkSync(tempZipPath);
        if (err.name === 'AbortError') throw new Error('CANCELLED');
        throw new Error("Contraseña incorrecta o archivo corrupto.");
    } finally {
        if (abortId) activeControllers.delete(abortId);
    }
}