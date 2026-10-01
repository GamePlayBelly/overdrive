import re
p = 'css/ui.css'
s = open(p, encoding='utf8').read()
i = s.index('/* ---------- loading ---------- */')
j = s.index('/* ---------- curtain (scene transition) ---------- */')
new_boot = '''/* ---------- loading ---------- */
#boot { position: fixed; inset: 0; z-index: 100; background: #050608; overflow: hidden; }
#boot canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#boot .boot-shade { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgba(3, 4, 6, 0.55) 0%, rgba(3, 4, 6, 0) 22%, rgba(3, 4, 6, 0) 66%, rgba(3, 4, 6, 0.72) 100%); }
#boot .boot-title { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); white-space: nowrap; font-family: 'Barlow', var(--font); font-weight: 600; font-size: clamp(22px, 3.2vw, 44px); letter-spacing: 0.62em; padding-left: 0.62em; text-transform: uppercase; color: rgba(255, 255, 255, 0.92); opacity: 0; animation: bootTitle 1.6s 0.5s var(--ease) forwards; transition: top 1.3s var(--ease), left 1.3s var(--ease), transform 1.3s var(--ease), font-size 1.3s var(--ease), letter-spacing 1.3s var(--ease); pointer-events: none; }
#boot .boot-title small { display: block; margin-top: 14px; font-size: 0.2em; letter-spacing: 0.9em; padding-left: 0.9em; font-weight: 500; color: rgba(255, 255, 255, 0.5); }
#boot.docked .boot-title { top: 5.2vh; left: 4vw; transform: none; font-size: 15px; letter-spacing: 0.5em; padding-left: 0; opacity: 0.9; animation: none; }
#boot.docked .boot-title small { display: none; }
@keyframes bootTitle { 0% { opacity: 0; filter: blur(8px); } 35% { opacity: 1; filter: none; } 100% { opacity: 1; filter: none; } }
#boot .boot-tip { position: absolute; left: 50%; bottom: 14.5vh; transform: translateX(-50%); width: min(560px, 84vw); text-align: center; color: rgba(255, 255, 255, 0.66); font-size: 14px; line-height: 1.6; pointer-events: none; }
#boot .boot-tip .tip-label { font-size: 10.5px; letter-spacing: 0.34em; text-transform: uppercase; color: rgba(255, 255, 255, 0.38); margin-bottom: 6px; }
#boot .boot-tip .tip-text { min-height: 3.2em; transition: opacity 0.6s, transform 0.6s var(--ease); } #boot .boot-tip .tip-text.swap { opacity: 0; transform: translateY(6px); }
#boot .boot-bottom { position: absolute; left: 4vw; right: 4vw; bottom: 4.2vh; pointer-events: none; }
#boot .boot-status { display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase; color: rgba(255, 255, 255, 0.5); margin-bottom: 12px; }
#boot .boot-status b { font-weight: 500; color: rgba(255, 255, 255, 0.78); font-variant-numeric: tabular-nums; letter-spacing: 0.12em; }
#boot .boot-status .msg { display: inline-block; animation: msgin 0.5s var(--ease); }
@keyframes msgin { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
#boot .boot-bar { height: 1px; background: rgba(255, 255, 255, 0.16); position: relative; }
#boot .boot-bar i { position: absolute; inset: 0; background: rgba(255, 255, 255, 0.9); transform-origin: left; transform: scaleX(0); }
#boot .boot-go { position: absolute; left: 50%; bottom: 8.6vh; transform: translateX(-50%); opacity: 0; pointer-events: none; transition: opacity 0.8s; }
#boot .boot-go.show { opacity: 1; pointer-events: auto; }
#boot .boot-go button { border: 0; background: transparent; color: rgba(255, 255, 255, 0.86); font: 500 11px 'Barlow', var(--font); letter-spacing: 0.4em; text-transform: uppercase; padding: 12px 22px; cursor: pointer; animation: breathe 2.6s ease-in-out infinite; }
@keyframes breathe { 50% { opacity: 0.4; } }
#boot.gone { opacity: 0; pointer-events: none; transition: opacity 0.9s 0.1s; }
@keyframes fadeup { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

'''
s = s[:i] + new_boot + s[j:]
s = re.sub(r"\n#boot \{ --red: #ffb02e; --red2: #ff5a1f; \}\n#boot \.boot-bar i \{[^\n]*\n#boot \.boot-logo \{[^\n]*\n#boot \.boot-sub \{[^\n]*\n?", "\n", s)
open(p, 'w', encoding='utf8').write(s)

p = 'index.html'
h = open(p, encoding='utf8').read()
h = h.replace("family=Inter:wght@400;500;600;700;800&family=Barlow+Condensed", "family=Inter:wght@400;500;600;700;800&family=Barlow:wght@500;600&family=Barlow+Condensed")
open(p, 'w', encoding='utf8').write(h)

p = 'src/app/loading.js'
s = open(p, encoding='utf8').read()
i = s.index('export class Loading {')
j = s.index('  startWorker() {')
ctor = '''export class Loading {
  constructor(root) {
    this.root = root;
    this.p = 0; this.shown = 0; this.tip = 0; this.ready = false;
    this.canvas = h('canvas');
    this.pct = h('b', null, '0%');
    this.msg = h('span', { class: 'msg' }, 'Starting');
    this.fill = h('i');
    this.tipLabel = h('div', { class: 'tip-label' }, TIPS[0][0]);
    this.tipText = h('div', { class: 'tip-text' }, TIPS[0][1]);
    this.title = h('div', { class: 'boot-title' }, 'Overdrive', h('small', null, 'Riverton County'));
    this.go = h('div', { class: 'boot-go' }, h('button', null, 'Press any key to continue'));
    root.append(this.canvas, h('div', { class: 'boot-shade' }), this.title,
      h('div', { class: 'boot-tip' }, this.tipLabel, this.tipText), this.go,
      h('div', { class: 'boot-bottom' }, h('div', { class: 'boot-status' }, this.msg, this.pct), h('div', { class: 'boot-bar' }, this.fill)));
    this.startWorker();
    this.tipTimer = setInterval(() => this.nextTip(), 7000);
    this.dockTimer = setTimeout(() => root.classList.add('docked'), 3600);
    this.tickId = requestAnimationFrame(() => this.tick());
    this._key = (e) => { if (this.ready && !e.repeat && this.onContinue) this.onContinue(); };
    this._move = (e) => this.post({ type: 'mouse', x: e.clientX / innerWidth, y: e.clientY / innerHeight });
    addEventListener('keydown', this._key); addEventListener('pointermove', this._move);
    this.go.firstChild.addEventListener('click', () => this.onContinue?.());
  }

'''
s = s[:i] + ctor + s[j:]
a = "setTimeout(() => { this.tipLabel.textContent = TIPS[this.tip][0]; this.tipText.textContent = TIPS[this.tip][1]; this.tipText.classList.remove('swap'); }, 450);"
assert a in s
s = s.replace(a, a.replace('450', '600'))
a = "    clearInterval(this.tipTimer);\n    await new Promise((r) => setTimeout(r, 850));"
assert a in s
s = s.replace(a, "    clearInterval(this.tipTimer); clearTimeout(this.dockTimer);\n    await new Promise((r) => setTimeout(r, 1000));")
a = "h('div', { class: 'logo' }, 'REAL ', h('span', null, 'WORLD'))"
assert a in s
s = s.replace(a, "h('div', { class: 'logo' }, 'OVER', h('span', null, 'DRIVE'))")
s = s.replace("removeEventListener('keydown', this._key); removeEventListener('pointermove', this._move);", "removeEventListener('keydown', this._key); removeEventListener('pointermove', this._move);")
open(p, 'w', encoding='utf8').write(s)
print('ok')
