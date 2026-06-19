// The single-page web app served to a paired phone. It's a plain string (no
// build step) so the bridge can serve it directly. Backslash escapes destined
// for the *client* (regex, control characters) are written doubled here so that
// after this template literal is evaluated the served text keeps a single
// backslash.

export const MOBILE_CLIENT_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0e0e14" />
<title>GenNal Mobile</title>
<style>
  :root {
    --bg: #0e0e14; --panel: #171722; --panel-2: #1f1f2e; --line: #2a2a3c;
    --text: #e9e9f2; --muted: #9a9ab0; --accent: #7c5cff; --accent-2: #5b3df0;
    --danger: #ff6b6b; --ok: #4cd07d;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin: 0; height: 100%; }
  body {
    background: var(--bg); color: var(--text); font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column; height: 100dvh; overflow: hidden;
  }
  header {
    display: flex; align-items: center; gap: 10px; padding: 12px 14px;
    padding-top: calc(12px + env(safe-area-inset-top)); background: var(--panel); border-bottom: 1px solid var(--line);
  }
  .logo { width: 30px; height: 30px; border-radius: 9px; background: linear-gradient(135deg, var(--accent), var(--accent-2));
    display: grid; place-items: center; font-weight: 700; font-size: 15px; }
  header h1 { font-size: 15px; margin: 0; font-weight: 650; }
  header .sub { font-size: 11px; color: var(--muted); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); margin-left: auto; }
  .dot.on { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
  .dot.off { background: var(--danger); }

  .tabs { display: flex; background: var(--panel); border-bottom: 1px solid var(--line); }
  .tab { flex: 1; padding: 11px; text-align: center; color: var(--muted); font-weight: 600; font-size: 13px;
    background: none; border: none; border-bottom: 2px solid transparent; }
  .tab.active { color: var(--text); border-bottom-color: var(--accent); }

  .view { flex: 1; min-height: 0; display: none; flex-direction: column; }
  .view.active { display: flex; }

  /* chat */
  .models { display: flex; gap: 8px; padding: 10px 12px; overflow-x: auto; background: var(--bg); border-bottom: 1px solid var(--line); }
  .chip { flex: 0 0 auto; padding: 7px 13px; border-radius: 999px; background: var(--panel-2); color: var(--muted);
    border: 1px solid var(--line); font-size: 13px; font-weight: 600; }
  .chip.active { color: #fff; border-color: transparent; }
  .messages { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 12px; display: flex; flex-direction: column; gap: 12px; }
  .row { display: flex; }
  .row.me { justify-content: flex-end; }
  .bubble { max-width: 84%; padding: 10px 13px; border-radius: 15px; white-space: pre-wrap; word-wrap: break-word; font-size: 14.5px; }
  .me .bubble { background: var(--accent); color: #fff; border-bottom-right-radius: 5px; }
  .ai .bubble { background: var(--panel-2); border: 1px solid var(--line); border-bottom-left-radius: 5px; }
  .status { font-size: 12px; color: var(--muted); margin-top: 6px; font-style: italic; }
  .err { color: var(--danger); margin-top: 6px; font-size: 13px; white-space: pre-wrap; }
  .empty { color: var(--muted); text-align: center; margin: auto; padding: 24px; font-size: 14px; }

  .composer { display: flex; gap: 8px; padding: 10px 12px; padding-bottom: calc(10px + env(safe-area-inset-bottom));
    background: var(--panel); border-top: 1px solid var(--line); align-items: flex-end; }
  textarea, .term-input input {
    flex: 1; resize: none; background: var(--panel-2); color: var(--text); border: 1px solid var(--line);
    border-radius: 12px; padding: 11px 12px; font: inherit; max-height: 120px; outline: none;
  }
  textarea:focus, .term-input input:focus { border-color: var(--accent); }
  .send { flex: 0 0 auto; background: var(--accent); color: #fff; border: none; border-radius: 12px; padding: 0 16px; height: 44px;
    font-weight: 650; font-size: 14px; }
  .send:disabled { opacity: .5; }
  .send.stop { background: var(--danger); }

  /* terminal */
  .term-bar { display: flex; gap: 8px; padding: 10px 12px; background: var(--bg); border-bottom: 1px solid var(--line); align-items: center; }
  select { flex: 1; background: var(--panel-2); color: var(--text); border: 1px solid var(--line); border-radius: 10px; padding: 9px 10px; font: inherit; }
  .term-out { flex: 1; min-height: 0; overflow: auto; margin: 0; padding: 12px; background: #07070c; color: #cdd3e0;
    font: 12.5px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; word-break: break-all; }
  .term-input { display: flex; gap: 8px; padding: 10px 12px; padding-bottom: calc(10px + env(safe-area-inset-bottom));
    background: var(--panel); border-top: 1px solid var(--line); }
  .ghost { background: var(--panel-2); color: var(--text); border: 1px solid var(--line); border-radius: 10px; padding: 0 12px; height: 42px; font-weight: 600; }
</style>
</head>
<body>
  <header>
    <div class="logo">G</div>
    <div>
      <h1>GenNal Mobile</h1>
      <div class="sub" id="sub">Connecting…</div>
    </div>
    <div class="dot" id="dot"></div>
  </header>
  <div class="tabs">
    <button class="tab active" data-tab="chat">Chat</button>
    <button class="tab" data-tab="term">Terminal</button>
  </div>

  <section class="view active" id="view-chat">
    <div class="models" id="models"></div>
    <div class="messages" id="messages"><div class="empty" id="chatEmpty">Send a message to start a conversation on your computer.</div></div>
    <div class="composer">
      <textarea id="input" rows="1" placeholder="Message GenNal…"></textarea>
      <button class="send" id="send">Send</button>
    </div>
  </section>

  <section class="view" id="view-term">
    <div class="term-bar">
      <select id="paneSel"><option value="">No terminals open</option></select>
      <button class="ghost" id="paneRefresh">↻</button>
    </div>
    <pre class="term-out" id="termOut"></pre>
    <div class="term-input">
      <input id="termIn" placeholder="Type a command…" autocapitalize="off" autocorrect="off" spellcheck="false" />
      <button class="ghost" id="termSend">⏎</button>
      <button class="ghost" id="termCtrlC">^C</button>
    </div>
  </section>

<script>
(function(){
  var params = new URLSearchParams(location.search);
  var TOKEN = params.get('t') || '';
  function api(p){ return p + (p.indexOf('?') > -1 ? '&' : '?') + 't=' + encodeURIComponent(TOKEN); }
  function post(p, body){
    return fetch(api(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  function el(id){ return document.getElementById(id); }
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  var state = { models: [], modelId: '', panes: [], pane: '', sending: false, currentId: '' };
  var bubbles = {};

  // ---- tabs ----
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function(){
      var name = this.getAttribute('data-tab');
      for (var j = 0; j < tabs.length; j++) tabs[j].classList.toggle('active', tabs[j] === this);
      el('view-chat').classList.toggle('active', name === 'chat');
      el('view-term').classList.toggle('active', name === 'term');
    });
  }

  function setConn(ok){
    el('dot').className = 'dot ' + (ok ? 'on' : 'off');
    el('sub').textContent = ok ? 'Connected to your computer' : 'Connection lost — retrying…';
  }

  // ---- bootstrap ----
  function loadBootstrap(){
    return fetch(api('/api/bootstrap')).then(function(r){ return r.json(); }).then(function(d){
      state.models = d.models || [];
      state.panes = d.panes || [];
      if (state.models.length && !state.modelId) state.modelId = state.models[0].id;
      renderModels();
      renderPanes();
      setConn(true);
    }).catch(function(){ setConn(false); });
  }

  function renderModels(){
    var wrap = el('models'); wrap.innerHTML = '';
    state.models.forEach(function(m){
      var b = document.createElement('button');
      b.className = 'chip' + (m.id === state.modelId ? ' active' : '');
      b.textContent = m.label;
      if (m.id === state.modelId && m.accent) b.style.background = m.accent;
      b.addEventListener('click', function(){ state.modelId = m.id; renderModels(); });
      wrap.appendChild(b);
    });
    if (!state.models.length) wrap.innerHTML = '<span class="chip">No models available</span>';
  }

  function renderPanes(){
    var sel = el('paneSel');
    var prev = state.pane;
    sel.innerHTML = '';
    if (!state.panes.length) {
      sel.innerHTML = '<option value="">No terminals open</option>';
      state.pane = '';
      return;
    }
    state.panes.forEach(function(p){
      var o = document.createElement('option');
      o.value = p.id; o.textContent = p.label + (p.tag ? ' · ' + p.tag : '');
      sel.appendChild(o);
    });
    var stillThere = state.panes.some(function(p){ return p.id === prev; });
    state.pane = stillThere ? prev : state.panes[0].id;
    sel.value = state.pane;
  }
  el('paneSel').addEventListener('change', function(){ state.pane = this.value; el('termOut').textContent = ''; });
  el('paneRefresh').addEventListener('click', function(){ loadBootstrap(); });

  // ---- chat ----
  function ensureBubble(id){
    if (bubbles[id]) return bubbles[id];
    var empty = el('chatEmpty'); if (empty) empty.remove();
    var row = document.createElement('div'); row.className = 'row ai';
    var bubble = document.createElement('div'); bubble.className = 'bubble';
    var answer = document.createElement('span');
    var status = document.createElement('div'); status.className = 'status'; status.textContent = 'Thinking…';
    bubble.appendChild(answer); bubble.appendChild(status); row.appendChild(bubble);
    el('messages').appendChild(row);
    scrollChat();
    var rec = { answer: answer, status: status, bubble: bubble, text: '' };
    bubbles[id] = rec;
    return rec;
  }
  function scrollChat(){ var m = el('messages'); m.scrollTop = m.scrollHeight; }

  function onChatData(d){
    var rec = ensureBubble(d.id);
    if (d.stream === 'stdout') {
      rec.text += d.chunk;
      rec.answer.textContent = rec.text;
      rec.status.style.display = 'none';
    } else {
      var line = (d.chunk || '').trim();
      if (line) { rec.status.style.display = ''; rec.status.textContent = line; }
    }
    scrollChat();
  }
  function onChatExit(d){
    var rec = bubbles[d.id];
    if (rec) {
      rec.status.style.display = 'none';
      if (d.error) {
        var e = document.createElement('div'); e.className = 'err'; e.textContent = d.error;
        rec.bubble.appendChild(e);
      } else if (!rec.text) {
        rec.status.style.display = ''; rec.status.textContent = '(no reply)';
      }
    }
    if (d.id === state.currentId) finishSending();
    scrollChat();
  }

  function finishSending(){
    state.sending = false; state.currentId = '';
    var s = el('send'); s.textContent = 'Send'; s.classList.remove('stop');
  }

  function sendChat(){
    if (state.sending) { // acts as Stop
      if (state.currentId) post('/api/chat/cancel', { id: state.currentId });
      finishSending();
      return;
    }
    var text = el('input').value.trim();
    if (!text || !state.modelId) return;
    var id = uid();
    state.currentId = id; state.sending = true;
    var s = el('send'); s.textContent = 'Stop'; s.classList.add('stop');

    var empty = el('chatEmpty'); if (empty) empty.remove();
    var row = document.createElement('div'); row.className = 'row me';
    var b = document.createElement('div'); b.className = 'bubble'; b.textContent = text;
    row.appendChild(b); el('messages').appendChild(row);
    el('input').value = ''; autosize();
    ensureBubble(id);

    post('/api/chat', { id: id, modelId: state.modelId, prompt: text }).catch(function(){
      onChatExit({ id: id, error: 'Could not reach your computer.' });
    });
  }
  el('send').addEventListener('click', sendChat);

  function autosize(){ var t = el('input'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }
  el('input').addEventListener('input', autosize);

  // ---- terminal ----
  function clean(s){
    return s
      .replace(/\\x1b\\][^\\x07]*\\x07/g, '')
      .replace(/\\x1b[@-_][0-9;?]*[ -\\/]*[@-~]/g, '')
      .replace(/\\x1b[=>]/g, '')
      .replace(/\\r/g, '');
  }
  function appendTerm(text){
    var out = el('termOut');
    out.textContent += clean(text);
    if (out.textContent.length > 100000) out.textContent = out.textContent.slice(-80000);
    out.scrollTop = out.scrollHeight;
  }
  function onPtyData(d){ if (d.id === state.pane) appendTerm(d.data); }
  function sendTerm(extra){
    if (!state.pane) return;
    var input = el('termIn');
    var data = (extra !== undefined) ? extra : (input.value + '\\r');
    post('/api/pty/input', { id: state.pane, data: data });
    if (extra === undefined) input.value = '';
  }
  el('termSend').addEventListener('click', function(){ sendTerm(); });
  el('termIn').addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); sendTerm(); } });
  el('termCtrlC').addEventListener('click', function(){ sendTerm('\\x03'); });

  // ---- streams ----
  function openStreams(){
    var chatEs = new EventSource(api('/api/chat/stream'));
    chatEs.addEventListener('data', function(e){ onChatData(JSON.parse(e.data)); });
    chatEs.addEventListener('exit', function(e){ onChatExit(JSON.parse(e.data)); });
    chatEs.onerror = function(){ setConn(false); };
    chatEs.onopen = function(){ setConn(true); };

    var ptyEs = new EventSource(api('/api/pty/stream'));
    ptyEs.addEventListener('data', function(e){ onPtyData(JSON.parse(e.data)); });
  }

  loadBootstrap().then(openStreams);
  // Refresh model/pane list periodically so the phone reflects desktop changes.
  setInterval(loadBootstrap, 8000);
})();
</script>
</body>
</html>`
