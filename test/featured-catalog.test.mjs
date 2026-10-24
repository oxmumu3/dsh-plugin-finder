import test from 'node:test';
import assert from 'node:assert/strict';
import { featuredCatalog } from '../src/featured-catalog.js';
const expectedIds = ['agent-twin', 'family-assistant', 'dsh-dot', 'dot-harness'];
const strings = ['id', 'title', 'subtitle', 'summary', 'why', 'scenario', 'status', 'version', 'checkedAt'];
const lists = ['audience', 'topics', 'requirements', 'limitations', 'components', 'sourceUrls'];
const card = id => {
  const entry = featuredCatalog.find(item => item.id === id);
  assert.ok(entry, `missing curated product ${id}`);
  return entry;
};
const assertUtc = value => {
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
  assert.ok(Number.isFinite(Date.parse(value)), `invalid check timestamp ${value}`);
};
const assertPublicHttps = value => {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.username, '');
  assert.equal(url.password, '');
  assert.equal(url.hostname, 'github.com');
  assert.equal(url.pathname.split('/')[1], 'oxmumu3');
  assert.equal(url.search, '');
};

test('cold-start catalog offers exactly four distinct products rather than platform or component duplicates', () => {
  assert.equal(featuredCatalog.length, 4);
  assert.equal(new Set(featuredCatalog.map(entry => entry.id)).size, 4);
  assert.deepEqual(featuredCatalog.map(entry => entry.id), expectedIds);
});

test('each curated card explains its use, audience, requirements and evidence boundaries', () => {
  for (const id of expectedIds) {
    const entry = card(id);
    assert.deepEqual(Object.keys(entry).sort(), [...strings, ...lists, 'install'].sort());
    for (const field of strings) assert.ok(typeof entry[field] === 'string' && entry[field].trim(), `${id}.${field}`);
    for (const field of lists) {
      assert.ok(Array.isArray(entry[field]), `${id}.${field}`);
      assert.ok(entry[field].every(value => typeof value === 'string' && value.trim()), `${id}.${field} items`);
      if (field !== 'sourceUrls') assert.ok(entry[field].length > 0, `${id}.${field} is required`);
    }
    assert.ok(entry.topics.every(topic => ['twin', 'family', 'projects', 'connections'].includes(topic)));
    assert.ok(['available', 'preview', 'private'].includes(entry.status));
    assertUtc(entry.checkedAt);
    assert.match(entry.why, /自研/);
    assert.doesNotMatch(entry.why, /质量认证|官方推荐|唯一|最好/);
  }
});

test('project bridge and connection management stay inside their respective product cards', () => {
  assert.ok(card('agent-twin').components.includes('dsh-agent-twin'));
  assert.ok(card('family-assistant').components.includes('dsh-family-assistant'));
  assert.ok(card('dsh-dot').components.includes('dsh-project-companion'));
  assert.ok(card('dsh-dot').components.some(component => component.startsWith('dsh-wechat')));
  assert.ok(card('dot-harness').components.includes('dot-dsh-connector'));
  assert.ok(card('dot-harness').components.includes('dot-dsh-management'));
  assert.ok(!featuredCatalog.some(entry => ['dsh-wechat', 'dot-dsh-management', 'deepseek-harness', 'openai-dot'].includes(entry.id)));
});

test('scenario drafts describe needs without steering discovery to a brand or package', () => {
  for (const id of expectedIds) {
    const entry = card(id);
    assert.ok(entry.scenario.length >= 20 && entry.scenario.length <= 400);
    assert.doesNotMatch(entry.scenario, /Agent\s*Twin|DeepSeek|Harness|\bDSH\b|\bDot\b|OpenAI|dsh-|Slack/i);
    if (['family-assistant', 'dsh-dot'].includes(id)) assert.match(entry.scenario, /微信/, 'the required messaging platform must remain part of the need');
    assert.doesNotMatch(entry.scenario, /已验收|已经安装|保证|自动安装/);
    assert.doesNotMatch(entry.title, /dsh-|Agent\s*Twin|Harness|\bDot\b/i);
  }
});

test('only a checked exact public release is installable and all preview or private cards have no install target', () => {
  const installable = featuredCatalog.filter(entry => entry.install !== null);
  assert.deepEqual(installable.map(entry => entry.id), ['agent-twin']);
  for (const entry of installable) {
    assert.equal(entry.status, 'available');
    assert.deepEqual(Object.keys(entry.install).sort(), ['spec', 'verifiedAt', 'version']);
    assert.equal(entry.install.version, entry.version);
    assertUtc(entry.install.verifiedAt);
    assertPublicHttps(entry.install.spec);
    const path = new URL(entry.install.spec).pathname;
    assert.equal(path, `/oxmumu3/ai-twin-starter/releases/download/v${entry.version}/dsh-agent-twin-${entry.version}.tgz`);
    assert.ok(entry.sourceUrls.includes(`https://github.com/oxmumu3/ai-twin-starter/releases/tag/v${entry.version}`));
    assert.ok(entry.sourceUrls.includes(`https://github.com/oxmumu3/ai-twin-starter/releases/download/v${entry.version}/SHA256SUMS`));
    assert.match(entry.limitations.join(' '), /预发布/);
    assert.match(entry.limitations.join(' '), /不等于.*验收/);
  }
  for (const id of ['family-assistant', 'dsh-dot', 'dot-harness']) {
    const entry = card(id);
    assert.ok(['preview', 'private'].includes(entry.status));
    assert.equal(entry.install, null);
    assert.match(entry.limitations.join(' '), /未公开|没有.*公开|暂无.*公开/);
  }
});

test('bundled sources are public HTTPS references without private paths or account material', () => {
  for (const id of expectedIds) {
    const entry = card(id);
    for (const source of entry.sourceUrls) assertPublicHttps(source);
    const content = JSON.stringify(entry);
    assert.doesNotMatch(content, /\/Users\/|\/home\/|file:|localhost|127\.0\.0\.1|piggy00544|sk-[A-Za-z0-9]{10,}|Bearer\s+\S+|wxid_[\w-]+/i);
  }
});
