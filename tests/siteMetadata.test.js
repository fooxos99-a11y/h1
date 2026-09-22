import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { getSiteConfig } from '../src/site/siteConfigs.js';
import { renderSiteMetadata } from '../src/site/siteMetadata.js';

test('application text and project instructions retain only the Alhabib Map identity', async () => {
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) await inspect(target);
      else if (/\.(?:js|jsx|ts|tsx|html|json|webmanifest)$/.test(entry.name)) {
        assert.doesNotMatch(await readFile(target, 'utf8'), /رواسي/, target.pathname);
      }
    }
  }
  await inspect(new URL('../src/', import.meta.url));
  await inspect(new URL('../server/', import.meta.url));
  for (const file of ['AGENTS.md', 'index.html', 'public/manifest.webmanifest']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /رواسي/, file);
    assert.match(source, /الحبيب ماب/, file);
  }
});

test('each website declares its own search identity in static HTML', () => {
  for (const [key, name, url] of [['madarij', 'الحبيب ماب', 'https://mdarj.net/']]) {
    const markup = renderSiteMetadata(getSiteConfig(key));
    assert.ok(markup.includes(`<meta property="og:site_name" content="${name}" />`));
    const data = JSON.parse(markup.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(data.name, name);
    assert.equal(data.url, url);
    assert.doesNotMatch(markup, /رواسي/);
  }
});

test('site metadata escapes markup and cannot close the JSON script', () => {
  const markup = renderSiteMetadata({name:'"</script>',description:'<sample>&'});
  assert.ok(markup.includes('content="&quot;&lt;/script&gt;"'));
  assert.equal(markup.match(/<\/script>/g).length, 1);
});
