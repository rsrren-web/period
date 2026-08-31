import nodemailer from 'nodemailer';
import {loadPeriods,loadUserData,model} from './period-core.mjs';
import {buildReminderEvents,mailForEvent,testMails,zonedDate} from './reminder-engine.mjs';
import {openReminderLedger} from './reminder-ledger.mjs';

const isTest=process.env.FORCE_SEND_TEST==='true';
const isDryRun=process.env.REMINDER_DRY_RUN==='true';
const required=['OWNER_EMAIL','PARTNER_EMAIL',...isDryRun?[]:['GMAIL_USER','GMAIL_APP_PASSWORD']];
const missing=required.filter(key=>!process.env[key]);
if(missing.length)throw new Error(`缺少 GitHub Secrets: ${missing.join(', ')}`);

const dataPath=process.env.USER_DATA_PATH||'data/user-data.json';
const csvPath=process.env.PERIOD_CSV_PATH||'outputs/meiyou_periods_draft.csv';
const periods=loadPeriods(csvPath,dataPath),userData=loadUserData(dataPath),prediction=model(periods);
const date=process.env.REMINDER_DATE_OVERRIDE||zonedDate();
const ledger=await openReminderLedger(process.env.REMINDER_LEDGER_PATH||'.reminder-ledger.json');

if(process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&!isTest){console.log('手动运行只用于测试；未选择测试发送，因此不发送正式提醒。');process.exit(0)}

const mailContext={prediction,ownerEmail:process.env.OWNER_EMAIL,partnerEmail:process.env.PARTNER_EMAIL,ownerNotify:userData.settings?.ownerNotify!==false,partnerNotify:userData.settings?.partnerNotify!==false,recentHistory:ledger.history()};
const events=isTest?[]:buildReminderEvents({date,prediction,periods,userData}).filter(event=>!ledger.has(event.key));
const batches=isTest?[{key:'test',mails:testMails(mailContext)}]:events.map(event=>({key:event.key,event}));
if(!batches.length){console.log(`今天 ${date} 没有待发送邮件。`);process.exit(0)}

const transporter=isDryRun?null:nodemailer.createTransport({service:'gmail',auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}});
for(const batch of batches){
  const mails=batch.mails||mailForEvent(batch.event,{...mailContext,recentHistory:ledger.history()});
  if(!mails.length){console.log(`事件 ${batch.key} 的通知均已关闭。`);continue}
  for(const [index,mail] of mails.entries()){
    const deliveryKey=`${batch.key}:mail:${index}`;
    if(!isTest&&ledger.has(deliveryKey)){console.log(`事件 ${batch.key} 的第 ${index+1} 封邮件已发送，跳过。`);continue}
    const {meta,...message}=mail;
    if(isDryRun)console.log(`[dry-run] ${batch.key} -> ${message.to}${message.cc?` cc ${message.cc}`:''}: ${message.subject}`);
    else {await transporter.sendMail({from:`周期生活助手 <${process.env.GMAIL_USER}>`,...message});if(!isTest){await ledger.add(deliveryKey);if(meta)await ledger.remember(meta)}}
  }
  if(!isTest&&!isDryRun)await ledger.add(batch.key);
}
console.log(isDryRun?'邮件演练完成':isTest?'本人和伴侣测试邮件已发送':`已完成 ${batches.length} 个提醒事件。`);
