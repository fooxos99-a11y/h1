import fs from 'node:fs';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default;
const issues=JSON.parse(fs.readFileSync('.sonar-issues.json','utf8').replace(/^\uFEFF/,''));
const files=[...new Set(issues.filter(i=>i.rule==='javascript:S3358').map(i=>i.component.split(':').slice(1).join(':')))];
let fixed=0;
for(const file of files){
 let source=fs.readFileSync(file,'utf8');
 for(let pass=0;pass<150;pass++){
  const ast=parse(source,{sourceType:'module',plugins:['jsx']});let action=null;
  const text=n=>source.slice(n.start,n.end);
  traverse(ast,{ConditionalExpression(path){
   if(action)return;
   const n=path.node;
   // Limit this pass to conditions nested directly in another condition.
   let nested=false;path.traverse({Function(p){p.skip();},JSXExpressionContainer(p){p.skip();},ConditionalExpression(p){nested=true;p.skip();}});if(!nested)return;
   let arrow=path.findParent(p=>p.isArrowFunctionExpression()&&p.node.body.type!=='BlockStatement');
   if(arrow && arrow.node.body!==n){const a=arrow.node; const prefix=source.slice(a.start,a.body.start); action=[{start:a.start,end:a.end,value:prefix.slice(0,prefix.lastIndexOf('=>')+2)+` { return (${text(a.body)}); }`}];return;}
   let unsafe=false;path.traverse({AwaitExpression(){unsafe=true;},YieldExpression(){unsafe=true;}});if(unsafe && !path.parentPath.isReturnStatement() && !path.parentPath.isArrowFunctionExpression()) { const declaration=path.parentPath;const statement=declaration.parentPath;if(!declaration.isVariableDeclarator()||declaration.node.init!==n||!statement.isVariableDeclaration()||statement.node.declarations.length!==1||declaration.node.id.type!=='Identifier')return;const name=declaration.node.id.name;const pad=' '.repeat(statement.node.loc.start.column); const assign=(node,space)=>node.type==='ConditionalExpression'?`${space}if (${text(node.test)}) {\n${assign(node.consequent,space+'  ')}\n${space}} else {\n${assign(node.alternate,space+'  ')}\n${space}}`:`${space}${name} = ${text(node)};`; action=[{start:statement.node.start,end:statement.node.end,value:`let ${name};\n${assign(n,pad)}`}];return; }
   const indent=' '.repeat(n.loc.start.column);
   const branches=(node,space)=>{
    if(node.type!=='ConditionalExpression')return `${space}return ${text(node)};`;
    return `${space}if (${text(node.test)}) {\n${branches(node.consequent,space+'  ')}\n${space}}\n${branches(node.alternate,space)}`;
   };
   if(path.parentPath.isReturnStatement()){
    const statement=path.parentPath.node;const pad=' '.repeat(statement.loc.start.column);
    action=[{start:statement.start,end:statement.end,value:path.parentPath.parentPath.isBlockStatement()?branches(n,pad).trimStart():`{\n${branches(n,pad+'  ')}\n${pad}}`}];
   }else if(path.parentPath.isArrowFunctionExpression()&&path.parentPath.node.body===n){
    const a=path.parentPath.node;const prefix=source.slice(a.start,n.start);action=[{start:a.start,end:a.end,value:prefix.slice(0,prefix.lastIndexOf('=>')+2)+` {\n${branches(n,'  ')}\n}`}];
   }else{
    const statement=path.getStatementParent();if(!statement||!statement.parentPath.isBlockStatement()&&!statement.parentPath.isProgram())return;
    const owner=path.findParent(p=>p.isVariableDeclarator()||p.isJSXAttribute()||p.isObjectProperty());
    const raw=owner?.node.id?.name||owner?.node.name?.name||owner?.node.key?.name||'conditional';
    const name=path.scope.generateUidIdentifier('resolve'+raw[0].toUpperCase()+raw.slice(1)).name;
    const pad=' '.repeat(statement.node.loc.start.column);
    action=[{start:statement.node.start,end:statement.node.start,value:`const ${name} = () => {\n${branches(n,pad+'  ')}\n${pad}};\n${pad}`},{start:n.start,end:n.end,value:`${name}()`}];
   }
  }});
  if(!action)break;
  for(const e of action.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.value+source.slice(e.end);
  fixed++;
 }
 parse(source,{sourceType:'module',plugins:['jsx']}); fs.writeFileSync(file,source);
}
console.log('Expanded nested decision expressions:',fixed);
