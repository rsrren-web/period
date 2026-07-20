import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const ids=[...app.matchAll(/querySelector\(['"]#([A-Za-z0-9_-]+)/g)].map(match=>match[1]);
const dynamicIds=new Set(['undoBtn']);
const missing=[...new Set(ids)].filter(id=>!dynamicIds.has(id)&&!html.includes(`id="${id}"`));
if(missing.length)throw new Error(`HTML缺少应用引用的ID：${missing.join(', ')}`);
console.log(`DOM引用检查通过：${new Set(ids).size}个ID`);
