import nodemailer from 'nodemailer';
import {loadPeriods,loadUserData,model} from './period-core.mjs';
import {buildReminderEvents,mailForEvent,testMails,zonedDate} from './reminder-engine.mjs';

const isTest=process.env.FORCE_SEND_TEST==='true';
const isDryRun=process.env.REMINDER_DRY_RUN==='true';
const required=['OWNER_EMAIL','PARTNER_EMAIL',...isDryRun?[]:['GMAIL_USER','GMAIL_APP_PASSWORD']];
const missing=required.filter(key=>!process.env[key]);
if(missing.length)throw new Error(`缺少 GitHub Secrets: ${missing.join(', ')}`);

const dataPath=process.env.USER_DATA_PATH||'data/user-data.json';
const csvPath=process.env.PERIOD_CSV_PATH||'outputs/meiyou_periods_draft.csv';
const periods=loadPeriods(csvPath,dataPath),userData=loadUserData(dataPath),prediction=model(periods);
const date=process.env.REMINDER_DATE_OVERRIDE||zonedDate();

if(process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&!isTest){console.log('手动运行只用于测试；未选择测试发送，因此不发送正式提醒。');process.exit(0)}

const mailContext={prediction,ownerEmail:process.env.OWNER_EMAIL,partnerEmail:process.env.PARTNER_EMAIL,ownerNotify:userData.settings?.ownerNotify!==false,partnerNotify:userData.settings?.partnerNotify!==false};
const events=isTest?[]:buildReminderEvents({date,prediction,periods,userData});
const batches=isTest?[{key:'test',mails:testMails(mailContext)}]:events.map(event=>({key:event.key,mails:mailForEvent(event,mailContext)}));
if(!batches.length){console.log(`今天 ${date} 没有待发送邮件。`);process.exit(0)}

const transporter=isDryRun?null:nodemailer.createTransport({service:'gmail',auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}});
for(const batch of batches){
  if(!batch.mails.length){console.log(`事件 ${batch.key} 的通知均已关闭。`);continue}
  for(const mail of batch.mails){
    if(isDryRun)console.log(`[dry-run] ${batch.key} -> ${mail.to}${mail.cc?` cc ${mail.cc}`:''}: ${mail.subject}`);
    else await transporter.sendMail({from:`周期生活助手 <${process.env.GMAIL_USER}>`,...mail});
  }
}
console.log(isDryRun?'邮件演练完成':isTest?'本人和伴侣测试邮件已发送':`已完成 ${batches.length} 个提醒事件。`);
