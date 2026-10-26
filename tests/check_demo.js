/* Node.js smoke tests for the static synthetic-only AuditJE public preview. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const js = fs.readFileSync(path.join(__dirname,"../docs/demo.js"),"utf8");
const html = fs.readFileSync(path.join(__dirname,"../docs/index.html"),"utf8");
const css = fs.readFileSync(path.join(__dirname,"../docs/demo.css"),"utf8");
assert(html.includes('src="./demo.js"') && html.includes('href="./demo.css"'));
assert(!html.includes('type="file"'),"Public demo must not invite confidential uploads");
assert(!js.includes("fetch("),"Demo may not transmit user data");
assert(css.length>1000);
const ids = [...js.matchAll(/\$\("([^"]+)"\)/g)].map(x=>x[1]);
for(const id of new Set(ids))assert(html.includes('id="'+id+'"'),"Missing HTML control: "+id);
const domEvents={};const elements=new Map();
function element(id){
  if(!elements.has(id))elements.set(id,{
    id, value:({"sample-size":"12","risk-percent":"60","random-seed":"2026","tier-filter":"All","search":""})[id]||"",
    textContent:"", style:{}, children:[],
    append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);},
    replaceChildren(...items){this.children=[...items];},addEventListener(name,fn){this["on_"+name]=fn;},
    click(){},remove(){}
  });
  return elements.get(id);
}
const document={
  body:element("body"),getElementById:element,
  createElement(tag){return {tag,style:{},children:[],textContent:"",
    append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);},
    replaceChildren(...items){this.children=[...items];},click(){},remove(){}};
  },
  addEventListener(name,fn){domEvents[name]=fn;}
};
new Function("document","URL","Blob","setTimeout",js)(document,{createObjectURL:()=>"",revokeObjectURL:()=>{}},function(){},()=>{});
assert.equal(typeof domEvents.DOMContentLoaded,"function");
domEvents.DOMContentLoaded();
assert.equal(element("total-entries").textContent,36);
assert.equal(element("sample-count").textContent,12);
assert.equal(element("risk-tbody").children.length,36);
assert(Number(element("high-count").textContent)>0);
assert(element("control-note").textContent.includes("difference detected"));
const before=element("risk-tbody").children.map(row=>row.children[6].textContent);
element("sample-size").value="8";element("sample-size").on_change.call(element("sample-size"));
assert.equal(element("sample-count").textContent,8);
element("sample-size").value="12";element("sample-size").on_change.call(element("sample-size"));
assert.deepEqual(element("risk-tbody").children.map(row=>row.children[6].textContent),before,"Same seed should reproduce sample");
element("tier-filter").value="High";element("tier-filter").on_change.call(element("tier-filter"));
assert.equal(element("risk-tbody").children.length,Number(element("high-count").textContent));
element("reset").on_click();
assert.equal(element("risk-tbody").children.length,36);
assert.equal(element("sample-count").textContent,12);
console.log("AuditJE synthetic public preview checks passed.");
