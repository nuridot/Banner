const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function page(fetch = async () => ({ ok: true, status: 200, text: async () => '{"isSuccess":true}' })) {
  const dom = new JSDOM(read('index.html'), { url: 'https://nuridot.com/', runScripts: 'outside-only' });
  const w = dom.window;
  w.matchMedia = () => ({ matches: true });
  w.requestAnimationFrame = () => 0;
  w.fetch = fetch;
  w.eval(read('assets/braille.js'));
  w.eval(read('assets/app.js'));
  return { dom, w, d: w.document };
}
function fill(d) {
  for (const [id, value] of Object.entries({ org: '검증 기관', who: '테스트', em: 'test@example.com', tel: '010-0000-0000', pg: '1,000쪽 미만', 'inquiry-type': 'TRIAL', msg: '체험 문의' })) d.getElementById(id).value = value;
  d.getElementById('ag').checked = true;
}
function submit(w) { w.document.getElementById('inq').dispatchEvent(new w.Event('submit', { cancelable: true })); }
const tick = () => new Promise(resolve => setImmediate(resolve));

test('all local assets, page links, and anchor targets exist', () => {
  for (const file of ['index.html', 'terms.html', 'privacy.html']) {
    const dom = new JSDOM(read(file));
    const d = dom.window.document;
    const ids = [...d.querySelectorAll('[id]')].map(n => n.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate ID in ${file}`);
    for (const el of d.querySelectorAll('[src],a[href],link[href]')) {
      const url = el.getAttribute('src') || el.getAttribute('href');
      if (/^(https?:|mailto:|data:)/.test(url)) continue;
      assert.notEqual(url, '#', 'placeholder link');
      if (url.startsWith('#')) assert.ok(d.getElementById(url.slice(1)), `${file}: ${url}`);
      else assert.ok(fs.existsSync(path.join(root, url === '/' ? 'index.html' : url)), `${file}: ${url}`);
    }
    dom.window.close();
  }
});

test('braille works before and after English and restores original text', () => {
  const { dom, d } = page();
  const heading = d.querySelector('h1').textContent;
  d.getElementById('brl').click();
  assert.equal(d.getElementById('brl').getAttribute('aria-pressed'), 'true');
  assert.match(d.querySelector('h1').textContent, /[\u2800-\u28ff]/);
  d.getElementById('brl').click();
  assert.equal(d.querySelector('h1').textContent, heading);
  d.getElementById('lang').click();
  assert.equal(d.documentElement.lang, 'en');
  d.getElementById('brl').click();
  assert.equal(d.getElementById('brl').getAttribute('aria-pressed'), 'true');
  d.getElementById('brl').click();
  assert.equal(d.querySelector('h1').textContent, heading);
  dom.window.close();
});

test('pricing tabs switch by keyboard and mobile menu closes on navigation', () => {
  const { dom, w, d } = page();
  d.getElementById('seg-ind').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight' }));
  assert.equal(d.getElementById('plans-org').hidden, false);
  assert.equal(d.getElementById('plans-ind').hidden, true);
  assert.equal(d.activeElement.id, 'seg-org');
  d.getElementById('menu').click();
  assert.equal(d.getElementById('menu').getAttribute('aria-expanded'), 'true');
  d.querySelector('#gnb a').click();
  assert.equal(d.getElementById('menu').getAttribute('aria-expanded'), 'false');
  dom.window.close();
});

test('required fields and consent prevent inquiry transmission', () => {
  let calls = 0;
  const { dom, w, d } = page(() => { calls++; });
  submit(w);
  assert.equal(d.activeElement.id, 'org');
  fill(d); d.getElementById('ag').checked = false;
  submit(w);
  assert.equal(d.activeElement.id, 'ag');
  assert.equal(calls, 0);
  dom.window.close();
});

test('inquiry payload preserves fields, blocks duplicate sends and resets on success', async () => {
  let calls = 0, payload, finish;
  const { dom, w, d } = page((url, options) => {
    calls++;
    assert.equal(url, 'https://api.semojum.app/api/public/inquiries');
    payload = JSON.parse(options.body);
    return new Promise(resolve => { finish = resolve; });
  });
  fill(d); submit(w); submit(w);
  assert.equal(calls, 1);
  assert.equal(payload.type, 'TRIAL');
  assert.equal(payload.title, '체험 문의');
  assert.equal(payload.email, 'test@example.com');
  for (const text of ['검증 기관', '010-0000-0000', '1,000쪽 미만', '체험 문의']) assert.ok(payload.message.includes(text));
  assert.equal(payload.website, '');
  assert.equal(d.querySelector('[type="submit"]').disabled, true);
  finish({ ok: true, status: 200, text: async () => '{"isSuccess":true}' });
  await tick();
  assert.equal(d.getElementById('org').value, '');
  assert.equal(d.getElementById('inquiry-type').value, '');
  assert.match(d.getElementById('fmsg').textContent, /접수되었습니다/);
  assert.equal(d.querySelector('[type="submit"]').disabled, false);
  // Status text must not desynchronize the precomputed braille text nodes.
  d.getElementById('brl').click();
  assert.equal(d.getElementById('brl').getAttribute('aria-pressed'), 'true');
  dom.window.close();
});

for (const [type, label] of Object.entries({ PURCHASE: '구매 문의', TRIAL: '체험 문의', SUGGESTION: '건의사항', ETC: '기타 (직접 입력)' })) {
  test(`inquiry ${type} reaches the API with its selected type and title`, async () => {
    let payload;
    const { dom, w, d } = page(async (_, options) => {
      payload = JSON.parse(options.body);
      return { ok: true, status: 200, text: async () => '{"isSuccess":true}' };
    });
    fill(d);
    const select = d.getElementById('inquiry-type');
    assert.deepEqual([...select.options].filter(o => o.value).map(o => o.textContent),
      ['구매 문의', '체험 문의', '건의사항', '기타 (직접 입력)']);
    select.value = type;
    select.dispatchEvent(new w.Event('change'));
    if (type === 'ETC') d.getElementById('inquiry-other').value = '  제휴 상담  ';
    // Display text changes must never become API enum values or erase the input.
    d.getElementById('lang').click();
    assert.equal(select.value, type);
    d.getElementById('brl').click();
    assert.equal(d.getElementById('brl').getAttribute('aria-pressed'), 'true');
    assert.match(select.selectedOptions[0].textContent, /[\u2800-\u28ff]/);
    assert.equal(select.value, type);
    submit(w); await tick();
    assert.equal(payload.type, type);
    assert.equal(payload.title, type === 'ETC' ? '제휴 상담' : label);
    assert.ok(payload.message.includes('문의 유형: ' + label));
    assert.equal(select.value, '');
    assert.equal(d.getElementById('inquiry-other').value, '');
    assert.equal(d.getElementById('inquiry-other-field').hidden, true);
    assert.equal(d.getElementById('inquiry-other').required, false);
    assert.equal(d.getElementById('inquiry-other').disabled, true);
    dom.window.close();
  });
}

test('inquiry type and a nonblank, bounded other title are required before sending', () => {
  let calls = 0;
  const { dom, w, d } = page(() => { calls++; });
  fill(d);
  const select = d.getElementById('inquiry-type'), other = d.getElementById('inquiry-other');
  select.value = ''; submit(w);
  assert.equal(d.activeElement, select);
  select.value = 'ETC'; select.dispatchEvent(new w.Event('change'));
  assert.equal(d.getElementById('inquiry-other-field').hidden, false);
  assert.equal(other.required, true);
  assert.equal(other.disabled, false);
  for (const title of ['', '   ', '가'.repeat(201)]) {
    other.value = title; submit(w);
    assert.equal(d.activeElement, other);
    assert.equal(calls, 0);
  }
  other.value = '제휴 상담';
  select.value = 'PURCHASE'; select.dispatchEvent(new w.Event('change'));
  assert.equal(other.value, '');
  assert.equal(other.required, false);
  assert.equal(other.disabled, true);
  assert.equal(d.getElementById('inquiry-other-field').hidden, true);
  dom.window.close();
});

for (const failure of ['rate-limit', 'server', 'network', 'malformed', 'application']) {
  test(`inquiry ${failure} failure retains input and permits retry`, async () => {
    const { dom, w, d } = page(async () => {
      if (failure === 'network') throw new Error('offline');
      return { ok: ['malformed', 'application'].includes(failure), status: failure === 'rate-limit' ? 429 : 500,
        text: async () => failure === 'malformed' ? '<html>not JSON</html>' : '{"isSuccess":false}' };
    });
    fill(d);
    d.getElementById('inquiry-type').value = 'ETC';
    d.getElementById('inquiry-type').dispatchEvent(new w.Event('change'));
    d.getElementById('inquiry-other').value = '제휴 상담';
    submit(w); await tick();
    assert.equal(d.getElementById('inquiry-type').value, 'ETC');
    assert.equal(d.getElementById('inquiry-other').value, '제휴 상담');
    assert.equal(d.getElementById('inquiry-other-field').hidden, false);
    assert.equal(d.getElementById('msg').value, '체험 문의');
    assert.equal(d.querySelector('[type="submit"]').disabled, false);
    assert.doesNotMatch(d.getElementById('fmsg').textContent, /접수되었습니다/);
    assert.ok(d.getElementById('fmsg').textContent.length > 0);
    dom.window.close();
  });
}
