import { useEffect, useState, useRef, DragEvent, ChangeEvent } from 'react'

const BLOCKED_EXTENSIONS = ['.exe', '.app', '.sh', '.bin', '.bat', '.cmd', '.com', '.msi', '.dmg', '.pkg', '.deb', '.rpm', '.jar', '.dll', '.sys'];
const isExecutable = (path: string) => BLOCKED_EXTENSIONS.some(ext => path.toLowerCase().endsWith(ext));
const hashAnswers = (a1: string, a2: string, a3: string) => (a1 || "").trim().toLowerCase() + "-" + (a2 || "").trim().toLowerCase() + "-" + (a3 || "").trim().toLowerCase();

const translations = {
    en: {
        setupTitle: "Setup",
        setupDesc: "Define your security questions.",
        q1Placeholder: "What was your first pet's name?",
        q2Placeholder: "In what city were you born?",
        q3Placeholder: "What is your favorite food?",
        saveBtn: "Save",
        backBtn: "← Back",
        cancelSelectionBtn: "← Cancel selection",
        cancelEncryptBtn: "Stop Encryption",
        cancelDecryptBtn: "Stop Decryption",
        cancelRecoveryBtn: "Stop Recovery",
        encryptTitle: "Encrypt",
        decryptTitle: "Protected File",
        recoveryTitle: "Recovery",
        passwordPlaceholder: "Password",
        confirmPlaceholder: "Confirm",
        enterPasswordPlaceholder: "Enter your password",
        encryptBtn: "LOCK",
        viewBtn: "View",
        restoreBtn: "Restore",
        recoverBtn: "Recover File",
        forgotPassword: "Forgot your password?",
        dropZoneTitle: "Cipher",
        dropZoneDesc: "(drag files or folders here)",
        selectBtn: "Select",
        configBtn: "⚙️ Config",
        completed: "completed",
        processing: "Processing...",
        opening: "Opening...",
        restoring: "Restoring...",
        successEncrypt: "Successfully protected!",
        successRestore: "Success!",
        successOpen: "Opened!",
        destroyingResidue: "Destroying residue...",
        canceling: "Canceling...",
        finishDestroyBtn: "Finish and Destroy Residue",
        loading: "Loading...",
        secureViewTitle: "👀 Secure View",
        secureViewDesc1: "The file was opened in your default viewer.",
        secureViewDesc2: "When you finish reading or viewing it, close your external application and press the red button to destroy the temporary copy and avoid leaving traces.",
        errMissingPassword: "Password is missing.",
        errPasswordsNotMatch: "Passwords do not match.",
        errAnswerQuestions: "Answer all 3 questions.",
        errNotAllowed: "⛔ Security: Not allowed files",
        errMixFiles: "⚠️ Do not mix normal and encrypted files.",
        cancelInfo: "cancelled.",
        errCancelInfo: "cancelled. File intact.",
        encryptCanceled: "Encryption cancelled.",
        decryptCanceled: "Decryption cancelled.",
        filesInfo: "files",
        errCriticalRoot: "CRITICAL: Attempt to manipulate the root directory.",
        errSymlink: "Symlink ignored.",
        errSystemFile: "System file ignored.",
        errBlockedExt: "Contains blocked file: ",
        errFileNotAccessible: "File not accessible.",
        errProtectedSystemPath: "Protected system path: ",
        errMissingConfig: "Missing configuration."
    },
    es: {
        setupTitle: "Configuración",
        setupDesc: "Define tus preguntas de seguridad.",
        q1Placeholder: "¿Cuál fue el nombre de tu primera mascota?",
        q2Placeholder: "¿En qué ciudad naciste?",
        q3Placeholder: "¿Cuál es tu comida favorita?",
        saveBtn: "Guardar",
        backBtn: "← Volver",
        cancelSelectionBtn: "← Cancelar selección",
        cancelEncryptBtn: "Detener Encriptación",
        cancelDecryptBtn: "Detener Desencriptación",
        cancelRecoveryBtn: "Detener Recuperación",
        encryptTitle: "Encriptar",
        decryptTitle: "Archivo Protegido",
        recoveryTitle: "Recuperación",
        passwordPlaceholder: "Contraseña",
        confirmPlaceholder: "Confirmar",
        enterPasswordPlaceholder: "Ingresa tu contraseña",
        encryptBtn: "BLOQUEAR",
        viewBtn: "Ver",
        restoreBtn: "Restaurar",
        recoverBtn: "Recuperar Archivo",
        forgotPassword: "¿Olvidaste tu contraseña?",
        dropZoneTitle: "Cipher",
        dropZoneDesc: "(arrastra archivos o carpetas aquí)",
        selectBtn: "Seleccionar",
        configBtn: "⚙️ Config",
        completed: "completado",
        processing: "Procesando...",
        opening: "Abriendo...",
        restoring: "Restaurando...",
        successEncrypt: "¡Protegido con éxito!",
        successRestore: "¡Éxito!",
        successOpen: "¡Abierto!",
        destroyingResidue: "Destruyendo rastro...",
        canceling: "Cancelando...",
        finishDestroyBtn: "Terminar y Destruir Rastro",
        loading: "Cargando...",
        secureViewTitle: "👀 Visualización Segura",
        secureViewDesc1: "El archivo se abrió en tu visor predeterminado.",
        secureViewDesc2: "Cuando termines de leerlo o verlo, cierra tu aplicación externa y presiona el botón rojo para destruir la copia temporal y evitar dejar rastros.",
        errMissingPassword: "Falta contraseña.",
        errPasswordsNotMatch: "Las contraseñas no coinciden.",
        errAnswerQuestions: "Responde las 3 preguntas.",
        errNotAllowed: "⛔ Seguridad: Archivos no permitidos",
        errMixFiles: "⚠️ No mezcles archivos normales y encriptados.",
        cancelInfo: "cancelada.",
        errCancelInfo: "cancelada. Archivo intacto.",
        encryptCanceled: "Encriptación cancelada.",
        decryptCanceled: "Desencriptación cancelada.",
        filesInfo: "archivos",
        errCriticalRoot: "CRITICO: Intento de manipular el directorio raíz.",
        errSymlink: "Symlink ignorado.",
        errSystemFile: "Archivo de sistema ignorado.",
        errBlockedExt: "Contiene archivo bloqueado: ",
        errFileNotAccessible: "Archivo no accesible.",
        errProtectedSystemPath: "Ruta de sistema protegida: ",
        errMissingConfig: "Falta configuración."
    }
};
type Lang = 'en' | 'es';

function App() {
    const [language, setLanguage] = useState<Lang>('en');
    const t = (key: keyof typeof translations['en']) => translations[language][key] || key;

    const [view, setView] = useState('loading');
    const [files, setFiles] = useState<string[]>([]);
    const [isAutoClose, setIsAutoClose] = useState(false);

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [q1, setQ1] = useState('');
    const [q2, setQ2] = useState('');
    const [q3, setQ3] = useState('');

    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [pendingAction, setPendingAction] = useState<'open' | 'restore'>('open');

    const [isEncrypting, setIsEncrypting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [showProgress, setShowProgress] = useState(false);

    const [isDecrypting, setIsDecrypting] = useState(false);
    const [showDecryptProgress, setShowDecryptProgress] = useState(false);
    const [decryptProgress, setDecryptProgress] = useState(0);

    const [openedTempPath, setOpenedTempPath] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const ipc = (window as any).electron?.ipcRenderer;

    const parseBackendError = (errStr: string) => {
        if (!errStr) return "Unknown Error";
        if (errStr.startsWith('ERR_PROTECTED_SYSTEM_PATH|')) return t('errProtectedSystemPath') + errStr.split('|')[1];
        if (errStr.startsWith('ERR_BLOCKED_EXT|')) return t('errBlockedExt') + errStr.split('|')[1];
        if (errStr === 'ERR_CRITICAL_ROOT') return t('errCriticalRoot');
        if (errStr === 'ERR_SYMLINK') return t('errSymlink');
        if (errStr === 'ERR_SYSTEM_FILE') return t('errSystemFile');
        if (errStr === 'ERR_FILE_NOT_ACCESSIBLE') return t('errFileNotAccessible');
        if (errStr === 'ERR_MISSING_CONFIG') return t('errMissingConfig');
        return errStr;
    };

    const clearAllData = () => {
        setQ1(''); setQ2(''); setQ3(''); setPassword(''); setConfirm('');
        setError(''); setStatus(''); setFiles([]);
        setIsEncrypting(false); setProgress(0); setShowProgress(false);
        setIsDecrypting(false); setDecryptProgress(0); setShowDecryptProgress(false);
        setOpenedTempPath(null);
    };

    const processPaths = (paths: string[], autoMode = false) => {
        const blocked = paths.find(p => isExecutable(p));
        if (blocked) { setError(`${t('errNotAllowed')} (${blocked}).`); setStatus(""); setFiles([]); return; }

        const cipherFiles = paths.filter(p => p.endsWith('.cipher'));
        const normalFiles = paths.filter(p => !p.endsWith('.cipher'));

        if (cipherFiles.length > 0 && normalFiles.length > 0) {
            setError(t('errMixFiles'));
            setStatus("");
            setFiles([]);
            return;
        }

        setFiles(paths);
        if (autoMode) setIsAutoClose(true);
        setError(''); setStatus(''); setPassword('');
        setView(cipherFiles.length > 0 ? 'decrypt' : 'encrypt');
    };

    const processFiles = (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return;
        const paths: string[] = [];
        const api = (window as any).api;
        for (let i = 0; i < fileList.length; i++) {
            let p = api?.getPath ? api.getPath(fileList[i]) : "";
            if (!p) p = (fileList[i] as any).path;
            if (p) paths.push(p);
        }
        if (paths.length > 0) processPaths(paths, false);
    };

    useEffect(() => {
        if (!ipc) return;
        ipc.invoke('check-setup').then((res: { isSetup: boolean, language: string }) => {
            if (res.language === 'es' || res.language === 'en') setLanguage(res.language as Lang);
            ipc.invoke('get-initial-file').then((initialFiles: string[]) => {
                if (initialFiles && initialFiles.length > 0) processPaths(initialFiles, true);
                else setView(res.isSetup ? 'encrypt' : 'setup');
            });
        });

        ipc.on('open-file-direct', (_e: any, incomingFiles: string[]) => processPaths(incomingFiles, false));
        ipc.on('encryption-progress', (_e: any, percent: number) => setProgress(percent));
        ipc.on('decryption-progress', (_e: any, percent: number) => setDecryptProgress(percent));
    }, []);

    const goBack = () => {
        if (view === 'recovery') {
            setQ1(''); setQ2(''); setQ3(''); setError(''); setStatus(''); setView('decrypt');
        } else {
            clearAllData();
            if (view === 'decrypt') { setView('encrypt'); setIsAutoClose(false); }
            else if (view === 'setup') setView('encrypt');
        }
    };

    const goToSetup = () => { clearAllData(); setView('setup'); };
    const goToRecovery = () => { setPendingAction('restore'); setQ1(''); setQ2(''); setQ3(''); setError(''); setStatus(''); setView('recovery'); };

    const handleManualSelect = () => { setError(''); setStatus(''); fileInputRef.current?.click(); }
    const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => processFiles(e.target.files);
    const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); };
    const handleDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); processFiles(e.dataTransfer.files); };

    const handleSetup = async () => {
        if (!q1 || !q2 || !q3) { setError(t('errAnswerQuestions')); setStatus(''); return; }
        if (ipc) Object.assign(window, { _langSave: ipc.invoke('save-setup', hashAnswers(q1, q2, q3), language) });
        clearAllData(); setView('encrypt');
    };

    const handleCancellationFinish = (message: string) => {
        if (isAutoClose) {
            ipc.invoke('close-app');
        } else {
            clearAllData();
            setView('encrypt');
            setStatus(message);
        }
    };

    const cancelEncryption = async () => {
        await ipc.invoke('cancel-action');
        setIsEncrypting(false); setShowProgress(false); setStatus(t('canceling')); setError('');
    };

    const cancelDecryption = async () => {
        await ipc.invoke('cancel-decrypt-action');
        setIsDecrypting(false); setShowDecryptProgress(false); setStatus(t('canceling')); setError('');
    };

    const handleEncrypt = async () => {
        if (!password) { setError(t('errMissingPassword')); setStatus(""); return; }
        if (password !== confirm) { setError(t('errPasswordsNotMatch')); setStatus(""); return; }

        setIsEncrypting(true); setProgress(0); setError(''); setStatus(t('processing'));
        const timerId = setTimeout(() => setShowProgress(true), 1500);

        const res = await ipc.invoke('encrypt-action', { files, password });
        clearTimeout(timerId);

        if (res.success) {
            setProgress(100);
            setStatus(t('successEncrypt'));
            setTimeout(() => {
                if (isAutoClose) ipc.invoke('close-app');
                else { clearAllData(); setView('encrypt'); }
            }, 1500);
        } else if (res.cancelled) {
            handleCancellationFinish(t('encryptCanceled'));
        } else {
            setIsEncrypting(false); setShowProgress(false);
            setError(parseBackendError(res.error)); setStatus("");
        }
    };

    const runDecryption = async (secret: string, method: 'password' | 'qa', action: 'open' | 'restore') => {
        setError('');
        setStatus(action === 'open' ? t('opening') : t('restoring'));
        setIsDecrypting(true);
        setDecryptProgress(0);

        const timerId = setTimeout(() => setShowDecryptProgress(true), 1500);

        let targetFiles = action === 'restore' ? files : [files[0]];

        const res = await ipc.invoke('decrypt-action', { files: targetFiles, secret, method, action });
        clearTimeout(timerId);

        if (res.success) {
            setDecryptProgress(100);

            if (action === 'restore') {
                setStatus(t('successRestore'));
                setTimeout(() => {
                    if (isAutoClose) ipc.invoke('close-app');
                    else { clearAllData(); setView('encrypt'); }
                }, 1500);
            } else {
                if (res.tempPath) setOpenedTempPath(res.tempPath);

                setPassword("");
                setStatus(t('successOpen'));
                setIsDecrypting(false);
                setShowDecryptProgress(false);

                setTimeout(() => {
                    setStatus("");
                }, 2500);
            }
        } else if (res.cancelled) {
            handleCancellationFinish(t('decryptCanceled'));
        } else {
            setIsDecrypting(false); setShowDecryptProgress(false);
            setError(parseBackendError(res.error)); setStatus("");
        }
    };

    const handleDecryptWithPassword = (action: 'open' | 'restore') => {
        if (!password) { setError(t('errMissingPassword')); setStatus(""); return; }
        runDecryption(password, 'password', action);
    };

    const handleRecoverySubmit = async () => await runDecryption(hashAnswers(q1, q2, q3), 'qa', pendingAction);

    const handleCloseTemp = async () => {
        if (openedTempPath) {
            setStatus(t('destroyingResidue'));
            setError("");
            await ipc.invoke('shred-action', openedTempPath);
            setOpenedTempPath(null);

            if (isAutoClose) {
                ipc.invoke('close-app');
            } else {
                clearAllData();
                setView('encrypt');
            }
        }
    }

    const handleKeyEncrypt = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleEncrypt(); };
    const handleKeyDecrypt = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleDecryptWithPassword(files.length === 1 ? 'open' : 'restore');
        }
    };
    const handleKeySetup = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSetup(); };
    const handleKeyRecovery = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleRecoverySubmit(); };

    const handleLanguageToggle = async (nextLang: Lang) => {
        setLanguage(nextLang);
        if (ipc) await ipc.invoke('save-language', nextLang);
    };

    if (view === 'setup') return (
        <div className="main-container">
            <button onClick={goBack} className="btn-absolute top-left">{t('backBtn')}</button>
            <div className="content-wrapper">
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-10px', gap: '4px' }}>
                    <button onClick={() => { if (language !== 'en') handleLanguageToggle('en') }} style={{ background: language === 'en' ? 'rgba(59, 130, 246, 0.5)' : 'none', border: '1px solid #4b5563', borderRadius: '4px', color: 'white', padding: '2px 8px', cursor: language === 'en' ? 'default' : 'pointer', fontSize: '10px' }}>
                        🇬🇧 EN
                    </button>
                    <button onClick={() => { if (language !== 'es') handleLanguageToggle('es') }} style={{ background: language === 'es' ? 'rgba(59, 130, 246, 0.5)' : 'none', border: '1px solid #4b5563', borderRadius: '4px', color: 'white', padding: '2px 8px', cursor: language === 'es' ? 'default' : 'pointer', fontSize: '10px' }}>
                        🇪🇸 ES
                    </button>
                </div>
                <h1 className="text-2xl text-blue-400">{t('setupTitle')}</h1>
                <p className="text-sm">{t('setupDesc')}</p>
                <div className="input-group" onKeyDown={handleKeySetup}>
                    <input className="input-field" placeholder={t('q1Placeholder')} value={q1} onChange={e => setQ1(e.target.value)} />
                    <input className="input-field" placeholder={t('q2Placeholder')} value={q2} onChange={e => setQ2(e.target.value)} />
                    <input className="input-field" placeholder={t('q3Placeholder')} value={q3} onChange={e => setQ3(e.target.value)} />
                </div>
                {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                <button onClick={handleSetup} className="btn-primary bg-blue-600">{t('saveBtn')}</button>
            </div>
        </div>
    );

    if (view === 'encrypt') return (
        <div onDragOver={handleDragOver} onDrop={handleDrop} className="main-container">
            {!isEncrypting && <button onClick={goToSetup} className="btn-absolute top-right">{t('configBtn')}</button>}
            <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileInputChange} />

            <div className="content-wrapper">
                {files.length === 0 ? (
                    <>
                        <div className="drop-zone">
                            <h2 className="text-2xl font-bold">{t('dropZoneTitle')}</h2>
                            <p className="text-sm">{t('dropZoneDesc')}</p>
                        </div>
                        <button onClick={handleManualSelect} className="btn-primary bg-blue-600">{t('selectBtn')}</button>
                        {status && <p className={`text-sm text-center mt-2 ${status.toLowerCase().includes(t('cancelInfo').toLowerCase().replace('.', '')) ? 'text-red-500' : 'text-green-500'}`}>{status}</p>}
                    </>
                ) : (
                    <>
                        {!isEncrypting && <button onClick={clearAllData} className="btn-cancel">{t('cancelSelectionBtn')}</button>}
                        <h2 className="text-xl text-red-500 text-center">{t('encryptTitle')}</h2>
                        <div className="file-info">{files.length === 1 ? files[0] : `${files.length} ${t('filesInfo')}`}</div>

                        <div className="input-group" onKeyDown={handleKeyEncrypt}>
                            <input type="password" disabled={isEncrypting} placeholder={t('passwordPlaceholder')} className="input-field" style={{ opacity: isEncrypting ? 0.5 : 1 }} value={password} onChange={e => setPassword(e.target.value)} />
                            <input type="password" disabled={isEncrypting} placeholder={t('confirmPlaceholder')} className="input-field" style={{ opacity: isEncrypting ? 0.5 : 1 }} value={confirm} onChange={e => setConfirm(e.target.value)} />
                        </div>

                        {status && <p className={`text-sm text-center ${status === t('processing') ? 'text-blue-400' : 'text-green-500'}`}>{status}</p>}

                        {isEncrypting && showProgress && (
                            <div className="progress-container">
                                <div className="progress-bar-bg">
                                    <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                                </div>
                                <p className="text-xs text-gray-400 text-center mt-1">{progress}% {t('completed')}</p>
                                <button onClick={cancelEncryption} className="btn-cancel mx-auto block text-red-500 hover:text-red-400" style={{ marginTop: '12px' }}>{t('cancelEncryptBtn')}</button>
                            </div>
                        )}

                        {!isEncrypting && <button onClick={handleEncrypt} className="btn-primary bg-red-600">{t('encryptBtn')}</button>}
                    </>
                )}
                {error && <div className="mt-4 p-3 bg-red-500/10 border border-red-500/50 rounded text-center"><p className="text-red-500 text-sm font-bold">{error}</p></div>}
            </div>
        </div>
    );

    if (view === 'decrypt') {
        if (openedTempPath) {
            return (
                <div className="main-container">
                    <div className="content-wrapper">
                        <h2 className="text-xl text-blue-400 text-center">{t('secureViewTitle')}</h2>
                        <div className="file-info">{files[0]}</div>
                        <p className="text-sm text-center">{t('secureViewDesc1')}</p>
                        <p className="text-xs text-gray-400 text-center mb-4 mt-2">{t('secureViewDesc2')}</p>
                        {status && <p className="text-blue-400 text-sm text-center mb-2">{status}</p>}
                        <button onClick={handleCloseTemp} className="btn-primary bg-red-600">{t('finishDestroyBtn')}</button>
                    </div>
                </div>
            );
        }

        return (
            <div className="main-container">
                <button onClick={goBack} disabled={isDecrypting} className="btn-absolute top-left" style={{ opacity: isDecrypting ? 0.5 : 1 }}>{t('backBtn')}</button>
                <div className="content-wrapper">
                    <h2 className="text-xl text-green-500 text-center">{t('decryptTitle')}</h2>
                    <div className="file-info">{files.length === 1 ? files[0] : `${files.length} ${t('filesInfo')}`}</div>
                    <div className="input-group" onKeyDown={handleKeyDecrypt}>
                        <input type="password" disabled={isDecrypting} placeholder={t('enterPasswordPlaceholder')} className="input-field" style={{ opacity: isDecrypting ? 0.5 : 1 }} value={password} onChange={e => setPassword(e.target.value)} />
                    </div>
                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                    {status && <p className={`text-sm text-center ${status.toLowerCase().includes(t('opening').toLowerCase().replace('...', '')) || status.toLowerCase().includes(t('restoring').toLowerCase().replace('...', '')) ? 'text-blue-400' : 'text-green-500'}`}>{status}</p>}

                    {isDecrypting && showDecryptProgress && (
                        <div className="progress-container">
                            <div className="progress-bar-bg">
                                <div className="progress-bar-fill" style={{ width: `${decryptProgress}%`, backgroundColor: '#4ade80' }}></div>
                            </div>
                            <p className="text-xs text-gray-400 text-center mt-1">{decryptProgress}% {t('completed')}</p>
                            <button onClick={cancelDecryption} className="btn-cancel mx-auto block text-red-500 hover:text-red-400" style={{ marginTop: '12px' }}>{t('cancelDecryptBtn')}</button>
                        </div>
                    )}

                    {!isDecrypting && (
                        <div className="flex-row">
                            {files.length === 1 && <button onClick={() => handleDecryptWithPassword('open')} className="btn-primary bg-gray-600">{t('viewBtn')}</button>}
                            <button onClick={() => handleDecryptWithPassword('restore')} className="btn-primary bg-green-600">{t('restoreBtn')}</button>
                        </div>
                    )}

                    {!isDecrypting && <p onClick={goToRecovery} className="link-recovery">{t('forgotPassword')}</p>}
                </div>
            </div>
        );
    }

    if (view === 'recovery') return (
        <div className="main-container">
            <button onClick={goBack} disabled={isDecrypting} className="btn-absolute top-left" style={{ opacity: isDecrypting ? 0.5 : 1 }}>{t('backBtn')}</button>
            <div className="content-wrapper">
                <h1 className="text-xl text-yellow-500 text-center">{t('recoveryTitle')}</h1>
                <div className="file-info">{files.length === 1 ? files[0] : `${files.length} ${t('filesInfo')}`}</div>
                <p className="text-sm text-center">{t('setupDesc')}</p>
                <div className="input-group" onKeyDown={handleKeyRecovery}>
                    <input className="input-field" disabled={isDecrypting} placeholder={t('q1Placeholder')} style={{ opacity: isDecrypting ? 0.5 : 1 }} value={q1} onChange={e => setQ1(e.target.value)} />
                    <input className="input-field" disabled={isDecrypting} placeholder={t('q2Placeholder')} style={{ opacity: isDecrypting ? 0.5 : 1 }} value={q2} onChange={e => setQ2(e.target.value)} />
                    <input className="input-field" disabled={isDecrypting} placeholder={t('q3Placeholder')} style={{ opacity: isDecrypting ? 0.5 : 1 }} value={q3} onChange={e => setQ3(e.target.value)} />
                </div>
                {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                {status && <p className={`text-sm text-center ${status.toLowerCase().includes(t('opening').toLowerCase().replace('...', '')) || status.toLowerCase().includes(t('restoring').toLowerCase().replace('...', '')) ? 'text-blue-400' : 'text-green-500'}`}>{status}</p>}

                {isDecrypting && showDecryptProgress && (
                    <div className="progress-container">
                        <div className="progress-bar-bg">
                            <div className="progress-bar-fill" style={{ width: `${decryptProgress}%`, backgroundColor: '#eab308' }}></div>
                        </div>
                        <p className="text-xs text-gray-400 text-center mt-1">{decryptProgress}% {t('completed')}</p>
                        <button onClick={cancelDecryption} className="btn-cancel mx-auto block text-red-500 hover:text-red-400" style={{ marginTop: '12px' }}>{t('cancelRecoveryBtn')}</button>
                    </div>
                )}

                {!isDecrypting && <button onClick={handleRecoverySubmit} className="btn-primary bg-yellow-600">{t('recoverBtn')}</button>}
            </div>
        </div>
    );

    return <div className="main-container">{t('loading')}</div>;
}

export default App