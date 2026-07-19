const url=process.env.SYNC_STATUS_URL;
if(!url)throw new Error('缺少SYNC_STATUS_URL');
const response=await fetch(url,{headers:{'user-agent':'period-maintenance-check'}});
const result=await response.json().catch(()=>({}));
if(!response.ok||!result.githubOk)throw new Error('Worker无法连接GitHub，Token可能已失效');
if(result.tokenDaysRemaining===null)throw new Error('Worker未配置Token到期日');
if(result.tokenDaysRemaining<=30)throw new Error(`GitHub Token将在${result.tokenExpiresAt}到期，仅剩约${result.tokenDaysRemaining}天，请更换`);
console.log(`同步服务正常；Token剩余约${result.tokenDaysRemaining}天。`);
