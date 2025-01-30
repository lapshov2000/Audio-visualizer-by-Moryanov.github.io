class AudioController {
    constructor() {
        this.audioContext = null;
        this.microphonePermission = localStorage.getItem('microphonePermission') === 'granted';
        this.microphoneStream = null;
        this.currentTrack = null;
        this.currentSource = null;
        this.isSystemAudio = false;
        this.isPlaying = false;
        this.gainNode = null;
        this.analyser = null;
        
        window.addEventListener('DOMContentLoaded', () => {
            this.initializeElements();
            this.initializeEventListeners();
        });
    }

    initializeElements() {
        this.playPauseBtn = document.getElementById('playPause');
        this.progressSlider = document.getElementById('progress');
        this.volumeSlider = document.getElementById('volume');
        this.currentTimeSpan = document.getElementById('currentTime');
        this.durationSpan = document.getElementById('duration');
        this.systemAudioBtn = document.getElementById('systemAudio');
        this.fileAudioBtn = document.getElementById('fileAudio');
        this.audioFileInput = document.getElementById('audioFile');
        this.playerControls = document.getElementById('playerControls');
    }

    initializeEventListeners() {
        this.systemAudioBtn.onclick = () => this.switchToSystemAudio();
        this.fileAudioBtn.onclick = () => this.audioFileInput.click();
        this.audioFileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('audio/')) {
                this.handleFileAudio(file);
            } else {
                alert('Пожалуйста, выберите аудио файл');
            }
        };
        this.playPauseBtn.onclick = () => this.togglePlayPause();
        this.volumeSlider.oninput = (e) => {
            this.setVolume(e.target.value);
            document.getElementById('volumeValue').textContent = `${e.target.value}%`;
        };
        this.progressSlider.oninput = (e) => this.seek(e.target.value);
    }

    async initializeAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.gainNode = this.audioContext.createGain();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.7;
            this.gainNode.connect(this.audioContext.destination);
            this.analyser.connect(this.gainNode);

            if (!this.microphonePermission) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    });
                    this.microphoneStream = stream;
                    localStorage.setItem('microphonePermission', 'granted');
                    this.microphonePermission = true;
                } catch (error) {
                    console.error('Ошибка доступа к микрофону:', error);
                    localStorage.setItem('microphonePermission', 'denied');
                }
            }
        }
    }

    async switchToSystemAudio() {
        try {
            await this.initializeAudioContext();
            
            if (this.currentTrack) {
                this.currentTrack.pause();
                this.currentTrack.muted = true;
                this.currentTrack = null;
                this.isPlaying = false;
                this.updatePlayPauseButton();
            }

            if (this.microphoneStream) {
                if (this.currentSource) {
                    this.currentSource.disconnect();
                }
                this.currentSource = this.audioContext.createMediaStreamSource(this.microphoneStream);
                this.currentSource.connect(this.analyser);
                this.isSystemAudio = true;
            } else {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
                this.microphoneStream = stream;
                this.currentSource = this.audioContext.createMediaStreamSource(stream);
                this.currentSource.connect(this.analyser);
                this.isSystemAudio = true;
            }

            this.systemAudioBtn.classList.add('active');
            this.fileAudioBtn.classList.remove('active');
            this.disablePlayerControls(true);

            // Устанавливаем громкость на 0% для System Audio
            this.setVolume(0);
            this.volumeSlider.value = 0;
            document.getElementById('volumeValue').textContent = '0%';

            // Скрываем слайдер громкости и его заголовок
            this.volumeSlider.parentElement.style.display = 'none';
            document.querySelector('.slider-group:has(#volume)').style.display = 'none';
        } catch (error) {
            console.error('Ошибка доступа к системному аудио:', error);
        }
    }

    async handleFileAudio(file) {
        try {
            await this.initializeAudioContext();
            
            if (this.currentSource) {
                this.currentSource.disconnect();
            }
            
            if (this.currentTrack) {
                this.currentTrack.pause();
                this.currentTrack.muted = true;
                URL.revokeObjectURL(this.currentTrack.src);
            }

            if (this.microphoneStream) {
                this.microphoneStream.getTracks().forEach(track => {
                    track.enabled = false;
                    track.stop();
                });
                this.microphoneStream = null;
            }

            this.currentTrack = new Audio();
            this.currentTrack.src = URL.createObjectURL(file);
            this.currentTrack.crossOrigin = "anonymous";

            await new Promise((resolve) => {
                this.currentTrack.addEventListener('canplay', resolve, { once: true });
            });

            this.currentSource = this.audioContext.createMediaElementSource(this.currentTrack);
            this.currentSource.connect(this.analyser);
            this.currentSource.connect(this.gainNode);

            this.isSystemAudio = false;
            this.systemAudioBtn.classList.remove('active');
            this.fileAudioBtn.classList.add('active');
            this.disablePlayerControls(false);

            this.setupAudioEventListeners();
            this.play();

            // Устанавливаем громкость на 50% для File Audio
            this.setVolume(50);
            this.volumeSlider.value = 50;
            document.getElementById('volumeValue').textContent = '50%';

            // Показываем слайдер громкости и его заголовок
            this.volumeSlider.parentElement.style.display = 'flex';
            document.querySelector('.slider-group:has(#volume)').style.display = 'flex';

            // Обновляем отображение длительности трека
            this.durationSpan.textContent = this.formatTime(this.currentTrack.duration);
        } catch (error) {
            console.error('Ошибка при загрузке аудио файла:', error);
        }
    }

    setupAudioEventListeners() {
        if (!this.currentTrack) return;

        this.currentTrack.ontimeupdate = () => {
            if (!this.progressSlider.dragging) {
                const progress = (this.currentTrack.currentTime / this.currentTrack.duration) * 100;
                this.progressSlider.value = progress;
                this.currentTimeSpan.textContent = this.formatTime(this.currentTrack.currentTime);
            }
        };

        this.currentTrack.onloadedmetadata = () => {
            this.durationSpan.textContent = this.formatTime(this.currentTrack.duration);
        };

        this.currentTrack.onended = () => {
            this.isPlaying = false;
            this.updatePlayPauseButton();
        };
    }

    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() {
        if (!this.currentTrack || this.isSystemAudio) return;
        this.currentTrack.play().catch(console.error);
        this.isPlaying = true;
        this.updatePlayPauseButton();
    }

    pause() {
        if (!this.currentTrack || this.isSystemAudio) return;
        this.currentTrack.pause();
        this.isPlaying = false;
        this.updatePlayPauseButton();
    }

    seek(value) {
        if (!this.currentTrack || this.isSystemAudio) return;
        const time = (value / 100) * this.currentTrack.duration;
        this.currentTrack.currentTime = time;
    }

    setVolume(value) {
        if (this.gainNode) {
            const volume = value / 100;
            this.gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
        }
    }

    updatePlayPauseButton() {
        this.playPauseBtn.textContent = this.isPlaying ? '⏸️' : '▶️';
    }

    disablePlayerControls(disabled) {
        this.progressSlider.disabled = disabled;
        this.playPauseBtn.disabled = disabled;
        this.playerControls.style.display = disabled ? 'none' : 'flex';
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        seconds = Math.floor(seconds % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    getFrequencyData() {
        if (!this.analyser) return { bass: 0, mid: 0, treble: 0 };
        
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);
        
        const bass = average(dataArray.slice(0, 80));
        const mid = average(dataArray.slice(80, 160));
        const treble = average(dataArray.slice(160, 255));

        return {
            bass: bass / 255,
            mid: mid / 255,
            treble: treble / 255
        };
    }
}

function average(array) {
    return array.reduce((a, b) => a + b, 0) / array.length;
}

const audioController = new AudioController();

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    if (!canvas) {
        console.error('Canvas элемент не найден');
        return;
    }

    const gl = canvas.getContext('webgl');
    if (!gl) {
        console.error('WebGL не поддерживается');
        return;
    }

    const vsSource = `
        attribute vec2 coords;
        void main(void) {
            gl_Position = vec4(coords.xy, 0.0, 1.0);
        }
    `;

    let prevBass = 0, prevMid = 0, prevTreble = 0;

    function smoothValue(current, previous, smoothFactor = 0.97) {
        return previous * smoothFactor + current * (1 - smoothFactor);
    }

    function clampValue(value, min = 0, max = 0.1) {
        return Math.min(Math.max(value, min), max);
    }

    const fsSource = `
        precision highp float;
        uniform vec2 mouse;
        uniform vec2 resolution;
        uniform float bassLevel;
        uniform float midLevel;
        uniform float trebleLevel;
        uniform float time;
        uniform float intensity;

        void main(void) {
            vec2 m = mouse/resolution;
            vec2 p = gl_FragCoord.xy;
            
            float tunnelDepth = 0.1 + 0.9 * sin(time * 0.1);
            vec2 tunnelOffset = vec2(
                cos(time * 0.1) * tunnelDepth,
                sin(time * 0.1) * tunnelDepth
            );
            
            vec2 q = (p + p - resolution) / resolution.y + tunnelOffset;
            
            float angle = time * 0.03 * (bassLevel * 0.05 + midLevel * 0.03) * intensity;
            float c = cos(angle), s = sin(angle);
            q = vec2(
                q.x * c - q.y * s,
                q.x * s + q.y * c
            );
            
            for(int i = 0; i < 10; i++) {
                q = abs(q)/dot(q,q) - (m + vec2(
                    cos(time * 0.2) * bassLevel * 0.02,
                    sin(time * 0.15) * trebleLevel * 0.02
                ) * intensity * 2.0);
            }
            
            float colorTime = time * 0.5 * (1.0 + (bassLevel + midLevel + trebleLevel) * 0.1);
            vec3 colorShift = 0.5 + 0.5 * cos(colorTime + vec3(0.0, 2.0, 4.0));
            
            vec3 color = vec3(q, q.x/q.y) * (1.0 + vec3(
                bassLevel * 0.08,
                midLevel * 0.08,
                trebleLevel * 0.08
            ) * intensity);
            
            color = mix(color, color * colorShift, 0.5);
            color = mix(color, vec3(1.0), length(q) * 0.1);
            
            gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        }
    `;

    const shaderProgram = createShaderProgram(gl, vsSource, fsSource);
    if (!shaderProgram) {
        console.error('Не удалось создать шейдерную программу');
        return;
    }

    gl.useProgram(shaderProgram);

    const positionBuffer = gl.createBuffer();
    const positions = new Float32Array([-1, 3, -1, -1, 3, -1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const coords = gl.getAttribLocation(shaderProgram, 'coords');
    gl.enableVertexAttribArray(coords);
    gl.vertexAttribPointer(coords, 2, gl.FLOAT, false, 0, 0);

    const mouse = gl.getUniformLocation(shaderProgram, 'mouse');
    const resolution = gl.getUniformLocation(shaderProgram, 'resolution');
    const bassLevel = gl.getUniformLocation(shaderProgram, 'bassLevel');
    const midLevel = gl.getUniformLocation(shaderProgram, 'midLevel');
    const trebleLevel = gl.getUniformLocation(shaderProgram, 'trebleLevel');
    const timeUniform = gl.getUniformLocation(shaderProgram, 'time');
    const intensityUniform = gl.getUniformLocation(shaderProgram, 'intensity');

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(resolution, canvas.width, canvas.height);
    }
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function normalize(value, min, max) {
        return (value - min) / (max - min);
    }

    function mapToRange(value, rangeMin, rangeMax) {
        return value * (rangeMax - rangeMin) + rangeMin;
    }

    let mouseX = canvas.width / 2, mouseY = canvas.height / 2;

    canvas.addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = canvas.height - e.clientY;
        document.getElementById('mousePositionValue').textContent = `X: ${Math.round(mouseX)}, Y: ${Math.round(mouseY)}`;
    });

    function lerp(start, end, t) {
        return start + (end - start) * t;
    }

    function updateMousePosition() {
        const levels = audioController.getFrequencyData();
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        // Нормализуем значения высоких частот
        const normalizedTreble = normalize(levels.treble, 0, 1);
        // Нормализуем значения низких частот
        const normalizedBass = normalize(levels.bass, 0, 1);

        // Убираем yBoost из расчета targetY
        const targetY = mapToRange(normalizedTreble, 500, 900);
        const targetX = mapToRange(normalizedBass, screenWidth / 4, (3 * screenWidth) / 4);

        // Плавно изменяем позицию Y
        mouseY = lerp(mouseY, targetY, 0.1);
        // Плавно изменяем позицию X
        mouseX = lerp(mouseX, targetX, 0.1);

        document.getElementById('mousePositionValue').textContent = `X: ${Math.round(mouseX)}, Y: ${Math.round(mouseY)}`;
    }

    // Обновляем позицию на каждом кадре
    function animate() {
        updateMousePosition();
        requestAnimationFrame(animate);
    }

    animate();

    function draw() {
        const levels = audioController.getFrequencyData();
        
        // Преобразуем значение из 0-100% в 0-0.03
        const fractalIntensity = document.getElementById('fractalIntensity').value / 100 * 0.03;
        const audioSensitivity = document.getElementById('audioSensitivity').value / 100 * 0.03;

        // Отображаем значение в процентах
        document.getElementById('fractalIntensityValue').textContent = 
            document.getElementById('fractalIntensity').value + '%';
        document.getElementById('audioSensitivityValue').textContent = 
            document.getElementById('audioSensitivity').value + '%';

        const rawBass = levels.bass * audioSensitivity;
        const rawMid = levels.mid * audioSensitivity;
        const rawTreble = levels.treble * audioSensitivity;

        prevBass = smoothValue(rawBass, prevBass, 0.97);
        prevMid = smoothValue(rawMid, prevMid, 0.97);
        prevTreble = smoothValue(rawTreble, prevTreble, 0.97);

        const smoothBass = clampValue(prevBass);
        const smoothMid = clampValue(prevMid);
        const smoothTreble = clampValue(prevTreble);

        gl.uniform2f(mouse, mouseX, mouseY);
        gl.uniform1f(bassLevel, smoothBass);
        gl.uniform1f(midLevel, smoothMid);
        gl.uniform1f(trebleLevel, smoothTreble);
        gl.uniform1f(timeUniform, Date.now() / 5000);
        gl.uniform1f(intensityUniform, fractalIntensity);

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        requestAnimationFrame(draw);
    }

    draw();
});

function createShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vsSource);
    gl.compileShader(vertexShader);

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        console.error('Ошибка компиляции vertex шейдера:', gl.getShaderInfoLog(vertexShader));
        gl.deleteShader(vertexShader);
        return null;
    }

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fsSource);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        console.error('Ошибка компиляции fragment шейдера:', gl.getShaderInfoLog(fragmentShader));
        gl.deleteShader(fragmentShader);
        return null;
    }

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('Ошибка линковки программы:', gl.getProgramInfoLog(shaderProgram));
        return null;
    }

    return shaderProgram;
}

class MandelbrotVisualizer {
    constructor() {
        this.canvas = document.getElementById('mandelbrotCanvas');
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        if (!this.gl) {
            alert('WebGL не поддерживается в вашем браузере');
            return;
        }

        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        this.initShaders();
        this.initBuffers();
        this.render();

        // Добавляем обработчик для клика по логотипу
        this.initLogoLink();
    }

    initLogoLink() {
        const logoLink = document.getElementById('logoLink');
        logoLink.addEventListener('click', () => {
            window.open('https://t.me/moryanov', '_blank');
        });
    }

    initShaders() {
        const vertexShaderSource = `
            attribute vec2 position;
            void main() {
                gl_Position = vec4(position, 0.0, 1.0);
            }
        `;

        const fragmentShaderSource = `
            precision highp float;
            uniform vec2 resolution;
            uniform vec2 center;
            uniform float zoom;

            int mandelbrot(vec2 c) {
                vec2 z = vec2(0.0);
                int iterations = 0;
                const int maxIterations = 1000;
                for (int i = 0; i < maxIterations; i++) {
                    if (length(z) > 2.0) break;
                    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
                    iterations++;
                }
                return iterations;
            }

            void main() {
                vec2 uv = (gl_FragCoord.xy / resolution - 0.5) * zoom + center;
                int iterations = mandelbrot(uv);
                float color = float(iterations) / 1000.0;
                gl_FragColor = vec4(vec3(color), 1.0);
            }
        `;

        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);

        this.program = this.createProgram(vertexShader, fragmentShader);
        this.gl.useProgram(this.program);

        this.resolutionLocation = this.gl.getUniformLocation(this.program, 'resolution');
        this.centerLocation = this.gl.getUniformLocation(this.program, 'center');
        this.zoomLocation = this.gl.getUniformLocation(this.program, 'zoom');
    }

    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Ошибка компиляции шейдера:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    createProgram(vertexShader, fragmentShader) {
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Ошибка линковки программы:', this.gl.getProgramInfoLog(program));
            this.gl.deleteProgram(program);
            return null;
        }
        return program;
    }

    initBuffers() {
        const vertices = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1
        ]);

        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

        const positionLocation = this.gl.getAttribLocation(this.program, 'position');
        this.gl.enableVertexAttribArray(positionLocation);
        this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);
    }

    render() {
        this.gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);
        this.gl.uniform2f(this.centerLocation, -0.5, 0.0);
        this.gl.uniform1f(this.zoomLocation, 3.0);

        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MandelbrotVisualizer();
});

