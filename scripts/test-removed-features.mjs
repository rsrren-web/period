import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const sources={
  app:await readFile(new URL('app.js',root),'utf8'),
  styles:await readFile(new URL('styles.css',root),'utf8'),
  worker:await readFile(new URL('worker/src/index.js',root),'utf8'),
  readme:await readFile(new URL('README.md',root),'utf8')
};

for(const token of ['JOURNAL_KEY','JOURNAL_PENDING_KEY','normalizeJournals','saveJournals','openJournal','data-journal-date']){
  assert.equal(sources.app.includes(token),false,`app.js still contains removed journal token: ${token}`);
}
for(const token of ['validateJournalPayload','mergeJournal','data/journals','familyVisible']){
  assert.equal(sources.worker.includes(token),false,`worker still contains removed feature token: ${token}`);
}
for(const token of ['has-journal','legend-dot.journal']){
  assert.equal(sources.styles.includes(token),false,`styles.css still contains removed journal selector: ${token}`);
}
for(const token of ['家人只读','周期随笔','view=family']){
  assert.equal(sources.readme.includes(token),false,`README still advertises removed feature: ${token}`);
}

console.log('Removed family-view and journal features are absent');
