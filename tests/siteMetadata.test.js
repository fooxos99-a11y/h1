import assert from 'node:assert/strict';
import test from 'node:test';
import { getSiteConfig } from '../src/site/siteConfigs.js';
import { renderSiteMetadata } from '../src/site/siteMetadata.js';

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
