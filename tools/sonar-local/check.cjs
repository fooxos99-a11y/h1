const fs = require('node:fs');
const { ESLint } = require('eslint');
const sonar = require('eslint-plugin-sonarjs');
const issues = JSON.parse(fs.readFileSync('.sonar-issues.json','utf8').replace(/^\uFEFF/,''));
const ids = new Set(issues.map(i=>i.rule.split(':')[1]));
const rules={};
for(const [name, rule] of Object.entries(sonar.rules)) {
 const id=rule.meta.docs?.url?.match(/S\d+/)?.[0];
 if(ids.has(id)) rules['sonar/'+name]='error';
}
const files = [...new Set(issues.map(i=>i.component.split(':').slice(1).join(':')).filter(p=>/\.(m?js|jsx)$/.test(p)))];
(async()=>{
const engine=new ESLint({overrideConfigFile:true,overrideConfig:[{files:['**/*.{js,jsx,mjs}'],languageOptions:{ecmaVersion:'latest',sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}}},plugins:{sonar},rules}]});
const results=await engine.lintFiles(files);
fs.writeFileSync('.sonar-local.json',JSON.stringify(results,null,2));
const counts={};for(const r of results)for(const m of r.messages)counts[m.ruleId]=(counts[m.ruleId]||0)+1;
console.log(JSON.stringify(counts,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
