const $=id=>document.getElementById(id);
const state={client:null,campaign:null,campaigns:[],adsets:[],selected:new Set(),history:['home'],mode:null};

async function api(path,options={}){
  const res=await fetch(path,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.message||'系統錯誤');
  return data;
}
function loading(v){$('loading').hidden=!v}
function toast(t){$('toast').textContent=t;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,2200)}
function screen(id,push=true){
  document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.id===id));
  if(push&&state.history.at(-1)!==id)state.history.push(id);
  $('back').textContent=id==='home'?'☰':'‹'; $('refresh').hidden=id!=='home'; scrollTo(0,0);
}
function back(){if(state.history.length<=1)return;state.history.pop();screen(state.history.at(-1),false)}
$('back').onclick=back;$('refresh').onclick=loadClients;

async function loadClients(){
  loading(true);
  try{
    const {clients}=await api('/api/clients');
    $('clients').innerHTML=clients.map(c=>`<button class="client" data-id="${c.id}"><b>${esc(c.name)}</b><span class="meta">進行中廣告：${c.campaignCounts.total} 組 ｜ 私訊 ${c.campaignCounts.message} ｜ 流量 ${c.campaignCounts.traffic}</span></button>`).join('')||'<p>尚無客戶資料</p>';
    document.querySelectorAll('.client').forEach(b=>b.onclick=()=>selectClient(clients.find(c=>c.id===b.dataset.id)));
  }catch(e){$('clients').innerHTML=`<p>${esc(e.message)}</p>`}finally{loading(false)}
}
function selectClient(c){state.client=c;$('clientName').textContent=c.name;screen('mode')}
$('individual').onclick=async()=>{state.mode='individual';loading(true);try{const d=await api(`/api/accounts/${encodeURIComponent(state.client.accountId)}/campaigns`);state.campaigns=d.campaigns;renderCampaigns();screen('campaigns')}catch(e){toast(e.message)}finally{loading(false)}};
$('unified').onclick=()=>{state.mode='unified';setDefaultDates();$('periodMode').textContent='統一回報';screen('period')};
function renderCampaigns(){
 $('campaignList').innerHTML=state.campaigns.map(c=>`<button class="card campaign" data-id="${c.id}"><b>${esc(c.name)}</b><span>${esc(c.typeLabel)}</span></button>`).join('');
 document.querySelectorAll('.campaign').forEach(b=>b.onclick=()=>selectCampaign(state.campaigns.find(c=>c.id===b.dataset.id)));
}
async function selectCampaign(c){
 state.campaign=c;loading(true);
 try{const d=await api(`/api/campaigns/${encodeURIComponent(c.id)}/adsets`);state.adsets=d.adSets;state.selected=new Set(d.adSets.map(x=>x.id));$('campaignName').textContent=c.name;renderAdsets();screen('adsets')}catch(e){toast(e.message)}finally{loading(false)}
}
function renderAdsets(){
 $('adsetList').innerHTML=state.adsets.map(a=>`<button class="adset ${state.selected.has(a.id)?'selected':''}" data-id="${a.id}"><b>${esc(a.name)}</b><span class="meta">${state.selected.has(a.id)?'✓ 已選擇':'點擊選擇'}</span></button>`).join('');
 document.querySelectorAll('.adset').forEach(b=>b.onclick=()=>{state.selected.has(b.dataset.id)?state.selected.delete(b.dataset.id):state.selected.add(b.dataset.id);renderAdsets()});
}
$('adsetNext').onclick=()=>{if(!state.selected.size)return toast('請至少選一個廣告組合');state.mode='individual';setDefaultDates();$('periodMode').textContent='個別回報';screen('period')};
function setDefaultDates(){const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');$('start').value=`${y}-${m}-01`;$('end').value=`${y}-${m}-${day}`;$('result').innerHTML=''}
$('run').onclick=async()=>{
 const startDate=$('start').value,endDate=$('end').value;if(!startDate||!endDate)return toast('請選擇日期');
 loading(true);
 try{
   const payload=state.mode==='unified'
    ?{accountId:state.client.accountId,startDate,endDate}
    :{accountId:state.client.accountId,campaignId:state.campaign.id,adSetIds:[...state.selected],startDate,endDate};
   const d=await api(state.mode==='unified'?'/api/reports/unified':'/api/reports/individual',{method:'POST',body:JSON.stringify(payload)});
   renderResult(d);
 }catch(e){toast(e.message)}finally{loading(false)}
};
function renderResult(d){
 if(state.mode==='unified'){
  $('result').innerHTML=(d.items||[]).map(x=>`<div class="metric"><strong>${esc(x.campaign.name)}</strong><div class="meta">${esc(x.status)}</div>${x.report?metrics(x.report):`<p>${esc(x.message||'')}</p>`}</div>`).join('');
 }else $('result').innerHTML=metrics(d.reports?.[0]);
}
function metrics(r){if(!r)return'';const d=r.data||{};return r.type==='message'
 ?`<div class="metric">累積私訊數<b>${n(d.messages)}</b></div><div class="metric">單次私訊成本<b>NT$ ${n(d.costPerMessage)}</b></div><div class="metric">累積花費<b>NT$ ${n(d.actualSpend)}</b></div>`
 :`<div class="metric">${esc(d.resultLabel||'成果')}次數<b>${n(d.resultCount)}</b></div><div class="metric">每次${esc(d.resultLabel||'成果')}成本<b>NT$ ${n(d.costPerResult)}</b></div><div class="metric">花費<b>NT$ ${n(d.actualSpend)}</b></div><div class="metric">點擊率<b>${Number(d.ctr||0).toFixed(2)}%</b></div>`}
function n(v){return Math.round(Number(v)||0).toLocaleString('zh-TW')}function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
loadClients();
