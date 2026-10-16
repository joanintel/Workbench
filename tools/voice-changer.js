/* Tool: Voice changer (category: audio) */
(function () {
  const EFFECTS = [
    { id: 'original', name: 'Original',  note: 'No change' },
    { id: 'chipmunk', name: 'Chipmunk',  note: 'Higher and faster' },
    { id: 'deep',     name: 'Deep',      note: 'Lower and slower' },
    { id: 'robot',    name: 'Robot',     note: 'Metallic buzz' },
    { id: 'alien',    name: 'Alien',     note: 'Warbly and strange' },
    { id: 'echo',     name: 'Echo',      note: 'Cave-like repeats' },
    { id: 'phone',    name: 'Old phone', note: 'Thin and crackly' }
  ];

  function render(root) {
    root.innerHTML =
      '<div class="panel" id="p-rec">' +
        '<h2>1. Get your audio</h2>' +
        '<div class="row"><button class="btn" id="rec">Start recording</button>' +
        '<span class="dot" id="dot"></span><span class="timer" id="timer">0:00</span></div>' +
        '<p class="file">Or choose a file: <input type="file" id="file" accept="audio/*"></p>' +
        '<p class="msg" id="msg" role="status"></p>' +
        '<div class="ask hidden" id="ask"></div>' +
      '</div>' +
      '<div class="panel hidden" id="p-fx"><h2>2. Pick an effect</h2><div class="fx" id="fx">' +
        EFFECTS.map((e, i) => '<button data-id="' + e.id + '" aria-pressed="' + (i === 0) + '">' + e.name + '<small>' + e.note + '</small></button>').join('') +
      '</div></div>' +
      '<div class="panel hidden" id="p-out"><h2>3. Listen and download</h2>' +
        '<audio id="player" controls></audio>' +
        '<div class="row"><a class="btn" id="dl" download="voice.wav">Download WAV</a></div></div>';

    const $ = id => root.querySelector('#' + id);
    let stream, recorder, chunks = [], timerId, t0, buffer = null, effect = 'original', outUrl = null, runId = 0, permStatus = null;
    const framed = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
    const msg = (t, err) => { $('msg').textContent = t; $('msg').className = 'msg' + (err ? ' err' : ''); };
    const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    const recParts = () => [$('rec').parentElement, $('file').parentElement];

    /* ----- loading audio ----- */
    async function loadBlob(blob) {
      msg('Reading audio...');
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
        ctx.close();
        msg('Ready: ' + buffer.duration.toFixed(1) + ' seconds.');
        $('p-fx').classList.remove('hidden'); $('p-out').classList.remove('hidden');
        apply();
      } catch (e) { msg('Could not read that audio. Try recording again or another file.', true); }
    }

    /* ----- microphone permission flow ----- */
    function hideAsk() { $('ask').classList.add('hidden'); recParts().forEach(p => p.classList.remove('hidden')); }
    function showAsk() {
      msg('');
      recParts().forEach(p => p.classList.add('hidden'));
      const a = $('ask'); a.classList.remove('hidden');
      a.innerHTML = '<p><strong>Turn on your microphone?</strong></p><div class="row"><button class="btn" id="askYes">Yes, turn it on</button><button class="btn ghost" id="askNo">No, upload a file</button></div>';
      $('askYes').onclick = async () => {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
          s.getTracks().forEach(t => t.stop());
          hideAsk(); msg('Microphone is on. Press Start recording.');
        } catch (e) { micError(e, true); }
      };
      $('askNo').onclick = () => { hideAsk(); $('file').click(); };
    }
    function showHelp() {
      const ua = navigator.userAgent;
      const tip = /iPhone|iPad|Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|CriOS|Firefox|FxiOS/.test(ua)
        ? 'Tap the aA icon in the address bar, choose Website Settings, then set Microphone to Allow.'
        : /Firefox|FxiOS/.test(ua)
        ? 'Click the microphone icon in the address bar and remove the block.'
        : 'Tap the lock or settings icon next to the address bar, then switch Microphone to Allow.';
      $('ask').innerHTML = '<p><strong>Your browser has the mic blocked for this site.</strong> Only your browser can change that, and it takes one step:</p><p>' + tip + '</p><p class="file">This page continues by itself once the mic is on.</p><button class="btn ghost" id="askNo2">Upload a file instead</button>';
      $('askNo2').onclick = () => { hideAsk(); $('file').click(); };
    }
    function micError(e, fromYes) {
      const n = e && e.name;
      if (n === 'NotFoundError' || n === 'OverconstrainedError') {
        hideAsk(); msg('No microphone was found on this device. Check that one is connected, or upload a file.', true);
      } else if (n === 'NotReadableError' || n === 'AbortError') {
        hideAsk(); msg('Your microphone is busy. Close other apps or tabs that use it, then try again, or upload a file.', true);
      } else if (framed) {
        msg('');
        recParts().forEach(p => p.classList.add('hidden'));
        const a = $('ask'); a.classList.remove('hidden');
        a.innerHTML = '<p><strong>This embedded window cannot use your microphone.</strong> Open the site directly in your browser instead, or upload a file.</p><button class="btn" id="askUp">Upload a file</button>';
        $('askUp').onclick = () => { hideAsk(); $('file').click(); };
      } else if (fromYes) { showHelp(); }
      else { showAsk(); }
    }
    (async () => {
      try {
        permStatus = await navigator.permissions.query({ name: 'microphone' });
        if (permStatus.state === 'denied' && !framed) showAsk();
        permStatus.onchange = () => {
          if (!root.isConnected) return;
          if (permStatus.state === 'granted') { hideAsk(); msg('Microphone is on. Press Start recording.'); }
          else if (permStatus.state === 'denied' && !framed) showAsk();
        };
      } catch (e) { /* Permissions API unavailable: the click flow still works */ }
    })();

    /* ----- recording ----- */
    async function startRec() {
      if (!navigator.mediaDevices || !window.MediaRecorder) { msg('Recording is not supported in this browser. Use the file option instead.', true); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (e) { micError(e, false); return; }
      chunks = []; recorder = new MediaRecorder(stream);
      recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
      recorder.onstop = () => { stream.getTracks().forEach(t => t.stop()); loadBlob(new Blob(chunks, { type: recorder.mimeType })); };
      recorder.start(); t0 = Date.now();
      $('p-rec').classList.add('recording');
      $('rec').textContent = 'Stop recording'; $('rec').classList.add('rec');
      timerId = setInterval(() => { $('timer').textContent = fmt((Date.now() - t0) / 1000); }, 250);
      msg('Recording...');
    }
    function stopRec() {
      clearInterval(timerId);
      $('p-rec').classList.remove('recording');
      $('rec').textContent = 'Record again'; $('rec').classList.remove('rec');
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    }
    $('rec').onclick = () => (recorder && recorder.state === 'recording') ? stopRec() : startRec();
    $('file').onchange = e => { const f = e.target.files[0]; if (f) loadBlob(f); };
    $('fx').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      effect = b.dataset.id;
      root.querySelectorAll('#fx button').forEach(x => x.setAttribute('aria-pressed', x === b));
      apply();
    };

    async function apply() {
      if (!buffer) return;
      const id = ++runId;
      msg('Applying effect...');
      try {
        const out = await processEffect(buffer, effect);
        if (id !== runId) return;
        if (outUrl) URL.revokeObjectURL(outUrl);
        outUrl = URL.createObjectURL(toWav(out));
        $('player').src = outUrl; $('dl').href = outUrl;
        $('dl').download = 'voice-' + effect + '.wav';
        msg('Press play to listen.');
      } catch (e) { msg('Something went wrong applying that effect.', true); }
    }

    return () => {
      clearInterval(timerId);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (outUrl) URL.revokeObjectURL(outUrl);
      if (permStatus) permStatus.onchange = null;
    };
  }

  async function processEffect(buf, fx) {
    const rate = { chipmunk: 1.5, deep: 0.75, alien: 1.15 }[fx] || 1;
    const tail = fx === 'echo' ? 2 : 0.2;
    const len = Math.ceil((buf.duration / rate + tail) * buf.sampleRate);
    const ctx = new OfflineAudioContext(buf.numberOfChannels, len, buf.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    let node = src;

    if (fx === 'robot' || fx === 'alien') {
      const g = ctx.createGain(); g.gain.value = fx === 'alien' ? 0.7 : 0;
      const osc = ctx.createOscillator();
      osc.frequency.value = fx === 'robot' ? 50 : 7;
      osc.type = fx === 'robot' ? 'square' : 'sine';
      const depth = ctx.createGain(); depth.gain.value = fx === 'robot' ? 1 : 0.6;
      osc.connect(depth); depth.connect(g.gain);
      osc.start(); node.connect(g); node = g;
    }
    if (fx === 'echo') {
      const dry = ctx.createGain(), delay = ctx.createDelay(1), fb = ctx.createGain(), mix = ctx.createGain();
      delay.delayTime.value = 0.28; fb.gain.value = 0.45;
      node.connect(dry); dry.connect(mix);
      node.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(mix);
      node = mix;
    }
    if (fx === 'phone') {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
      const drive = ctx.createWaveShaper();
      const c = new Float32Array(256); for (let i = 0; i < 256; i++) { c[i] = Math.tanh((i / 128 - 1) * 3); }
      drive.curve = c;
      node.connect(hp); hp.connect(lp); lp.connect(drive); node = drive;
    }
    node.connect(ctx.destination);
    src.start();
    return ctx.startRendering();
  }

  function toWav(buf) {
    const ch = buf.numberOfChannels, n = buf.length, rate = buf.sampleRate;
    const bytes = n * ch * 2, ab = new ArrayBuffer(44 + bytes), v = new DataView(ab);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, bytes, true);
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2;
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  Workbench.registerTool({
    category: 'audio',
    id: 'voice-changer',
    name: 'Voice changer',
    desc: 'Record your voice, pick an effect, download it.',
    render: render
  });
})();
