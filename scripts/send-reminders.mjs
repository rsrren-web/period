import nodemailer from 'nodemailer';
import {loadPeriods,model,addDays} from './period-core.mjs';

const required=['GMAIL_USER','GMAIL_APP_PASSWORD','OWNER_EMAIL','PARTNER_EMAIL'];
const missing=required.filter(k=>!process.env[k]);
if(missing.length)throw new Error(`缺少 GitHub Secrets: ${missing.join(', ')}`);

const periods=loadPeriods();const prediction=model(periods);
const now=new Date();
const vancouverDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Vancouver',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const reminderDate=addDays(prediction.next,-1);
const isTest=process.env.FORCE_SEND_TEST==='true';
if(!isTest&&vancouverDate!==reminderDate){console.log(`今天 ${vancouverDate} 无需发送；下次检查目标 ${reminderDate}`);process.exit(0)}

const transporter=nodemailer.createTransport({service:'gmail',auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}});
const common=`中心预测日期：${prediction.next}\n预测范围：${prediction.windowStart} 至 ${prediction.windowEnd}\n近期中心周期：${prediction.center} 天\n\n日期是基于历史记录的估算，可能提前或推迟。`;
const prefix=isTest?'【测试】':'';
const testNote=isTest?'这是一封配置测试邮件，用于确认周期生活助手可以正常发送提醒。\n\n':'';
await transporter.sendMail({from:`周期生活助手 <${process.env.GMAIL_USER}>`,to:process.env.OWNER_EMAIL,subject:`${prefix}明天接近预计经期`,text:`${testNote}明天接近本次经期的中心预测日期。建议今天确认用品、保证睡眠，并给明天的工作和运动留出调整空间。\n\n${common}`});
await transporter.sendMail({from:`周期生活助手 <${process.env.GMAIL_USER}>`,to:process.env.PARTNER_EMAIL,subject:`${prefix}伴侣关怀提醒：明天可能接近经期`,text:`${testNote}明天可能接近预计经期。她在这个阶段可能更需要休息或安排缓冲，实际感受以她本人为准。建议先询问她今天希望获得怎样的支持。\n\n${common}`});
console.log(isTest?'本人和伴侣测试邮件已发送':'本人和伴侣提醒已发送');
