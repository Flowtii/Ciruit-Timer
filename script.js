document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const timeText = document.getElementById('time-text');
    const phaseText = document.getElementById('phase-text');
    const roundText = document.getElementById('round-text');
    
    const playPauseBtn = document.getElementById('play-pause-btn');
    const resetBtn = document.getElementById('reset-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');
    
    const progressCircle = document.querySelector('.progress-ring__circle');
    const radius = progressCircle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
    progressCircle.style.strokeDashoffset = circumference;

    const settingsModal = document.getElementById('settings-modal');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const adjustBtns = document.querySelectorAll('.adjust-btn');
    const soundToggle = document.getElementById('sound-toggle');

    // --- State Variables ---
    let settings = {
        work: 45,
        rest: 15,
        rounds: 10,
        prepare: 10 // Fixed 10s preparation time
    };

    const PHASES = {
        IDLE: 'IDLE',
        PREPARE: 'PREPARE',
        WORK: 'WORK',
        REST: 'REST',
        DONE: 'DONE'
    };

    let currentState = PHASES.IDLE;
    let isRunning = false;
    let currentRound = 1;
    let phaseTimeRemaining = settings.work;
    let phaseTotalTime = settings.work;
    
    let lastTimestamp = 0;
    let animationFrameId = null;
    let lastSecondBeeped = -1;

    // --- Audio ---
    let audioCtx = null;
    
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function playBeep(frequency, duration, type = 'sine') {
        if (!soundToggle.checked) return;
        initAudio();
        
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        
        // Envelope to avoid clicks
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration);
    }

    // --- Timer Logic ---
    function formatTime(ms) {
        const totalSeconds = Math.ceil(ms / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function updateUI() {
        // Text
        timeText.textContent = formatTime(phaseTimeRemaining);
        roundText.textContent = `Runde ${currentRound} / ${settings.rounds}`;
        
        // Progress Ring
        const percent = phaseTimeRemaining / phaseTotalTime;
        const offset = circumference - percent * circumference;
        progressCircle.style.strokeDashoffset = offset;

        // Phase specific UI
        let colorVar = '';
        let text = '';

        switch (currentState) {
            case PHASES.IDLE:
                colorVar = '--color-prepare';
                text = 'BEREIT';
                break;
            case PHASES.PREPARE:
                colorVar = '--color-prepare';
                text = 'VORBEREITUNG';
                break;
            case PHASES.WORK:
                colorVar = '--color-work';
                text = 'BELASTUNG';
                break;
            case PHASES.REST:
                colorVar = '--color-rest';
                text = 'PAUSE';
                break;
            case PHASES.DONE:
                colorVar = '--color-done';
                text = 'GESCHAFFT!';
                progressCircle.style.strokeDashoffset = 0;
                timeText.textContent = "00:00";
                break;
        }

        phaseText.textContent = text;
        document.documentElement.style.setProperty('--current-color', `var(${colorVar})`);
    }

    function setPhase(newPhase) {
        currentState = newPhase;
        
        if (newPhase === PHASES.PREPARE) {
            phaseTotalTime = settings.prepare * 1000;
            phaseTimeRemaining = phaseTotalTime;
            playBeep(880, 0.4); // Start beep
        } else if (newPhase === PHASES.WORK) {
            phaseTotalTime = settings.work * 1000;
            phaseTimeRemaining = phaseTotalTime;
            playBeep(880, 0.4); // High beep for work
        } else if (newPhase === PHASES.REST) {
            phaseTotalTime = settings.rest * 1000;
            phaseTimeRemaining = phaseTotalTime;
            playBeep(440, 0.4); // Lower beep for rest
        } else if (newPhase === PHASES.DONE) {
            isRunning = false;
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
            playBeep(880, 0.2);
            setTimeout(() => playBeep(880, 0.2), 250);
            setTimeout(() => playBeep(1100, 0.5), 500); // Success fanfare
        }
        
        lastSecondBeeped = Math.ceil(phaseTimeRemaining / 1000);
        updateUI();
    }

    function tick(timestamp) {
        if (!isRunning) return;

        if (!lastTimestamp) lastTimestamp = timestamp;
        const delta = timestamp - lastTimestamp;
        lastTimestamp = timestamp;

        phaseTimeRemaining -= delta;

        // Check for beeps
        const currentSecond = Math.ceil(phaseTimeRemaining / 1000);
        if (currentSecond <= 3 && currentSecond > 0 && currentSecond !== lastSecondBeeped) {
            playBeep(440, 0.1); // Short warning beeps
            lastSecondBeeped = currentSecond;
        }

        if (phaseTimeRemaining <= 0) {
            // Phase transition
            if (currentState === PHASES.PREPARE) {
                setPhase(PHASES.WORK);
            } else if (currentState === PHASES.WORK) {
                if (currentRound >= settings.rounds) {
                    setPhase(PHASES.DONE);
                } else {
                    setPhase(PHASES.REST);
                }
            } else if (currentState === PHASES.REST) {
                currentRound++;
                setPhase(PHASES.WORK);
            }
        } else {
            updateUI();
        }

        if (isRunning) {
            animationFrameId = requestAnimationFrame(tick);
        }
    }

    function togglePlay() {
        initAudio(); // Must initialize audio on user interaction
        
        if (currentState === PHASES.DONE) {
            resetTimer();
            return;
        }

        if (currentState === PHASES.IDLE) {
            setPhase(PHASES.PREPARE);
        }

        isRunning = !isRunning;
        
        if (isRunning) {
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
            lastTimestamp = performance.now();
            animationFrameId = requestAnimationFrame(tick);
        } else {
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
            cancelAnimationFrame(animationFrameId);
            lastTimestamp = 0;
        }
    }

    function resetTimer() {
        isRunning = false;
        cancelAnimationFrame(animationFrameId);
        lastTimestamp = 0;
        
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        
        currentState = PHASES.IDLE;
        currentRound = 1;
        phaseTotalTime = settings.prepare * 1000;
        phaseTimeRemaining = phaseTotalTime;
        lastSecondBeeped = -1;
        
        updateUI();
    }

    // --- Settings Modal ---
    function openSettings() {
        if (isRunning) togglePlay();
        
        document.getElementById('work-time').value = settings.work;
        document.getElementById('rest-time').value = settings.rest;
        document.getElementById('rounds').value = settings.rounds;
        
        settingsModal.classList.remove('hidden');
    }

    function closeSettings() {
        settingsModal.classList.add('hidden');
    }

    function saveSettings() {
        settings.work = parseInt(document.getElementById('work-time').value, 10);
        settings.rest = parseInt(document.getElementById('rest-time').value, 10);
        settings.rounds = parseInt(document.getElementById('rounds').value, 10);
        
        closeSettings();
        resetTimer();
    }

    // --- Event Listeners ---
    playPauseBtn.addEventListener('click', togglePlay);
    resetBtn.addEventListener('click', resetTimer);
    settingsBtn.addEventListener('click', openSettings);
    saveSettingsBtn.addEventListener('click', saveSettings);

    // Adjust Buttons (+/-)
    adjustBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = btn.getAttribute('data-target');
            const change = parseInt(btn.getAttribute('data-change'), 10);
            const input = document.getElementById(targetId);
            let newValue = parseInt(input.value, 10) + change;
            
            const min = parseInt(input.getAttribute('min'), 10);
            const max = parseInt(input.getAttribute('max'), 10);
            
            if (newValue >= min && newValue <= max) {
                input.value = newValue;
            }
        });
    });

    // Close modal on background click
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettings();
        }
    });

    // Initialize UI
    resetTimer();
});
