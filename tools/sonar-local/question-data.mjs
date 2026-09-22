import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {parse} from '@babel/parser';
const configs=[['src/components/games/auction/auctionData.js','AUCTION_QUESTIONS','auctionQuestions.json'],['src/components/games/letter-hive/letterHiveData.js','LETTER_HIVE_QUESTIONS','letterHiveQuestions.json'],['src/components/games/categories/categoriesData.js','DEFAULT_CATEGORIES','categoriesQuestions.json']];
for(const [file,name,dataFile] of configs){
 const source=fs.readFileSync(file,'utf8');const ast=parse(source,{sourceType:'module'});const declaration=ast.program.body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.declarations?.[0]?.id.name===name);assert.ok(declaration);
 const init=declaration.declaration.declarations[0].init;const data=JSON.parse(source.slice(init.start,init.end));
 const before=(await import(pathToFileURL(path.resolve(file)).href))[name];assert.deepEqual(data,before);
 fs.writeFileSync(path.join(path.dirname(file),dataFile),JSON.stringify(data,null,2)+'\n');
 const changed=`import questionData from './${dataFile}' with { type: 'json' };\n\n`+source.slice(0,declaration.start)+`export const ${name} = questionData;`+source.slice(declaration.end);
 fs.writeFileSync(file,changed);
 const after=(await import(pathToFileURL(path.resolve(file)).href+'?json-data'))[name];assert.deepEqual(after,before);
 console.log(name,Array.isArray(data)?data.length:Object.values(data).reduce((n,v)=>n+v.length,0),'entries identical');
}
