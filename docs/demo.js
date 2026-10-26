/* AuditJE public preview v0.1 — uses synthetic data only. No network requests or uploaded records. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const count = 36;
  const amounts = [870,1250,10000,9000,13000,550,2250,760,300,870,1250,4800,4200,1000,1560,800,15000,2250,4000,720,500,3450,11000,600,925,1770,2990,13000,625,900,2190,5000,1900,7250,50000,420];
  const weights = {"Unbalanced entry":35,"Weekend posting":15,"After-hours entry":15,"Large value":25,"Round amount":10,"Manual source":15,"Near fiscal year-end":15,"Missing preparer":10,"Not approved":20,"Potential duplicate line":20};
  let entries = [];
  let sampled = [];
  let state = { filter:"All", query:"", sampleSize:12, riskPct:60, seed:2026 };
  function dateFor(i) { return "2026-09-" + String((i % 30) + 1).padStart(2,"0"); }
  function syntheticEntries() {
    return Array.from({length:count}, (_,i) => {
      const num = i+1;
      const amount=amounts[i], debit=amount, credit=(num===8?amount-35:amount);
      return { id:"JE-"+String(num).padStart(4,"0"), date:dateFor(i), debit, credit, amount, time:num%11===0?"21:30":"10:30", source:num%6===0?"Manual":"System", approval:num%9===0?"Pending":"Approved", preparer:num%10===0?"":"demo-user", duplicate:num===23 };
    });
  }
  function scoreAll() {
    const input=syntheticEntries();
    const sortedAmounts=input.map(x=>x.amount).slice().sort((a,b)=>a-b);
    const largeCutoff=sortedAmounts[Math.max(0,Math.ceil(sortedAmounts.length*.9)-1)];
    entries=input.map(x=>{
      const flags=[];
      const date = new Date(x.date+"T12:00:00Z");
      if(Math.abs(x.debit-x.credit)>.01)flags.push("Unbalanced entry");
      if(date.getUTCDay()===0||date.getUTCDay()===6)flags.push("Weekend posting");
      if(Number(x.time.slice(0,2))<7||Number(x.time.slice(0,2))>=19)flags.push("After-hours entry");
      if(x.amount>=largeCutoff && x.amount>0)flags.push("Large value");
      if(x.amount>=1000 && x.amount%1000===0)flags.push("Round amount");
      if(x.source==="Manual")flags.push("Manual source");
      if(Number(x.date.slice(8))>=26)flags.push("Near fiscal year-end");
      if(!x.preparer)flags.push("Missing preparer");
      if(x.approval!=="Approved")flags.push("Not approved");
      if(x.duplicate)flags.push("Potential duplicate line");
      const score=Math.min(100,flags.reduce((sum,f)=>sum+weights[f],0));
      return {...x, flags, score, tier:score>=50?"High":score>=20?"Medium":"Low", selected:""};
    });
    entries.sort((a,b)=>(b.score-a.score)||(b.amount-a.amount)||a.id.localeCompare(b.id));
  }
  function seedRandom(seed) {
    let s=(Number(seed)>>>0)||1;
    return function(){s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};
  }
  function selectSample() {
    const n=Math.min(entries.length, Math.max(0, Number(state.sampleSize)||0));
    const riskCount=Math.min(n,Math.ceil(n*Number(state.riskPct)/100));
    entries.forEach(x=>x.selected="");
    const targeted=entries.slice(0,riskCount);
    targeted.forEach(x=>x.selected="Risk-based");
    const remaining=entries.slice(riskCount);
    const random=seedRandom(state.seed);
    for(let i=remaining.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[remaining[i],remaining[j]]=[remaining[j],remaining[i]];}
    remaining.slice(0,n-riskCount).forEach(x=>x.selected="Random");
    sampled=entries.filter(x=>x.selected);
  }
  function usd(n){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);}
  function textNode(tag, str, cls){
    const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=String(str);return el;
  }
  function stats() {
    $("total-entries").textContent=entries.length;
    $("high-count").textContent=entries.filter(x=>x.tier==="High").length;
    $("quality-count").textContent=entries.filter(x=>x.flags.includes("Unbalanced entry")||x.flags.includes("Potential duplicate line")).length;
    $("sample-count").textContent=sampled.length;
    const n=entries.length, levels=["High","Medium","Low"];
    $("risk-bars").replaceChildren();
    levels.forEach(tier=>{
      const row=document.createElement("div");row.className="bar-row";
      const a=textNode("span",tier,"bar-label");const b=document.createElement("div");b.className="bar-track";
      const fill=document.createElement("div");fill.className="bar-fill "+tier.toLowerCase();
      fill.style.width=(entries.filter(x=>x.tier===tier).length/n*100)+"%";b.appendChild(fill);
      row.append(a,b,textNode("strong",entries.filter(x=>x.tier===tier).length));$("risk-bars").appendChild(row);
    });
    const debit=entries.reduce((sum,x)=>sum+x.debit,0);
    const credit=entries.reduce((sum,x)=>sum+x.credit,0);
    $("debit-total").textContent=usd(debit);
    $("credit-total").textContent=usd(credit);
    $("difference").textContent=usd(debit-credit);
    $("control-note").textContent=Math.abs(debit-credit)>.01?"Illustrative difference detected: investigate before concluding the population is reliable.":"Internal totals agree. Independent source-system reconciliation would still be required.";
  }
  function renderRows() {
    const filtered=entries.filter(x=>(state.filter==="All"||state.filter===x.tier)&&(x.id.toLowerCase().includes(state.query)||x.flags.join(" ").toLowerCase().includes(state.query)));
    $("results-count").textContent=filtered.length+" of "+entries.length+" journal entries";
    const body=$("risk-tbody");body.replaceChildren();
    filtered.forEach(x=>{
      const tr=document.createElement("tr");
      tr.append(textNode("td",x.id,"mono"),textNode("td",x.date),textNode("td",usd(x.amount)),textNode("td",x.score));
      const td=document.createElement("td");td.append(textNode("span",x.tier,"tag "+x.tier.toLowerCase()));tr.append(td);
      tr.append(textNode("td",x.flags.length?x.flags.join(" · "):"—","flags"),textNode("td",x.selected||"—"));
      body.appendChild(tr);
    });
    if(filtered.length===0){
      const tr=document.createElement("tr"),td=textNode("td","No entries match this filter.");td.colSpan=7;td.className="empty-row";tr.append(td);body.append(tr);
    }
  }
  function render() {scoreAll();selectSample();stats();renderRows();}
  function safeCSV(value) {
    let str=String(value??"");
    if(/^[=+@-]/.test(str))str="'"+str;
    return '"'+str.replace(/"/g,'""')+'"';
  }
  function downloadCSV() {
    const fields=["JE ID","Posting date","Debit","Credit","Magnitude","Risk score","Risk tier","Indicators","Selected by"];
    const rows=entries.map(x=>[x.id,x.date,x.debit.toFixed(2),x.credit.toFixed(2),x.amount.toFixed(2),x.score,x.tier,x.flags.join("; "),x.selected]);
    const csv="\uFEFF"+[fields,...rows].map(row=>row.map(safeCSV).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;a.download="auditje_synthetic_risk_register.csv";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  document.addEventListener("DOMContentLoaded",function(){
    $("sample-size").addEventListener("change",function(){state.sampleSize=Math.min(36,Math.max(0,Math.floor(Number(this.value)||0)));this.value=state.sampleSize;render();});
    $("risk-percent").addEventListener("change",function(){state.riskPct=Math.min(100,Math.max(0,Math.floor(Number(this.value)||0)));this.value=state.riskPct;render();});
    $("random-seed").addEventListener("change",function(){state.seed=(Number(this.value)||2026)|0;this.value=state.seed;render();});
    $("tier-filter").addEventListener("change",function(){state.filter=this.value;renderRows();});
    $("search").addEventListener("input",function(){state.query=this.value.trim().toLowerCase();renderRows();});
    $("reset").addEventListener("click",function(){state={filter:"All",query:"",sampleSize:12,riskPct:60,seed:2026};$("sample-size").value=12;$("risk-percent").value=60;$("random-seed").value=2026;$("tier-filter").value="All";$("search").value="";render();});
    $("export").addEventListener("click",downloadCSV);
    render();
  });
})();
