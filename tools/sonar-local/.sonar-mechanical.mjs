import fs from 'node:fs';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse = traverseModule.default;
const issues = JSON.parse(fs.readFileSync('.sonar-issues.json','utf8').replace(/^\uFEFF/,''));
const rulesByFile = new Map();
for(const issue of issues){ const file=issue.component.split(':').slice(1).join(':'); if(!/\.(m?js|jsx)$/.test(file))continue; if(!rulesByFile.has(file))rulesByFile.set(file,new Set()); rulesByFile.get(file).add(issue.rule.split(':')[1]); }
for(const [file,rules] of rulesByFile){
 let source=fs.readFileSync(file,'utf8'); const ast=parse(source,{sourceType:'module',plugins:['jsx']}); const edits=[];
 const text=n=>source.slice(n.start,n.end);
 const edit=(n,value)=>edits.push({start:n.start,end:n.end,value});
 traverse(ast,{
  SpreadElement(path){const n=path.node.argument;if(rules.has('S7744')&&n.type==='LogicalExpression'&&n.operator==='||'&&n.right.type==='ObjectExpression'&&!n.right.properties.length)edit(n,text(n.left));},
  CallExpression(path){const n=path.node;if(rules.has('S6594')&&n.callee.type==='MemberExpression'&&n.callee.property.name==='match'&&n.arguments.length===1&&n.arguments[0].type==='RegExpLiteral'&&!n.arguments[0].flags.includes('g'))edit(n,`${text(n.arguments[0])}.exec(${text(n.callee.object)})`);},
 });
 if(rules.has('S3863')){
  const imports=new Map(); for(const n of ast.program.body){if(n.type!=='ImportDeclaration')continue;const key=n.source.value;if(!imports.has(key)){imports.set(key,n);continue;} const first=imports.get(key); const all=[...first.specifiers,...n.specifiers]; if(all.some(s=>s.type==='ImportNamespaceSpecifier'))continue;
  const defaults=all.filter(s=>s.type==='ImportDefaultSpecifier').map(s=>s.local.name);const named=all.filter(s=>s.type==='ImportSpecifier').map(s=>s.imported.name===s.local.name?s.local.name:`${s.imported.name} as ${s.local.name}`);
  if(defaults.length>1)continue;
  const declaration=`import ${[...defaults,...(named.length?[`{ ${named.join(', ')} }`]:[])].join(', ')} from ${text(first.source)};`;
  const existing=edits.find(e=>e.start===first.start);if(existing)existing.value=declaration;else edit(first,declaration);edit(n,'');first.specifiers=all;
  }
 }
 edits.sort((a,b)=>b.start-a.start);let end=Infinity;for(const e of edits){if(e.end>end)throw new Error('Overlapping edit '+file);source=source.slice(0,e.start)+e.value+source.slice(e.end);end=e.start;}
 if(edits.length)fs.writeFileSync(file,source);
}
