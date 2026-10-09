import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { transformWithOxc } from '../frontend/node_modules/vite/dist/node/index.js';
import React from '../frontend/node_modules/react/index.js';
import { renderToStaticMarkup } from '../frontend/node_modules/react-dom/server.node.js';
import { productionTotals } from '../frontend/src/context/productionUnits.js';
const require = createRequire(import.meta.url);
const entries = [{ _id:'old-cnc', employeeId:'EMP007', employeeName:'Manoj', department:'CNC', cuttingWeight:77, hours:30, project:'Project Alpha', remarks:'Keep this remark', shift:'Day', date:'2026-09-30' }, { _id:'old-welding', employeeId:'EMP007', employeeName:'Manoj', department:'WELDING', rmt:232, hours:5 }];
let settings = {companyName:'ABC Steel Industries',plantName:'Chennai Plant',departments:[{name:'CNC',active:false,unit:'TON'},{name:'PTW',active:true,unit:'KG'},{name:'WELDING',active:true,unit:'PCS'},{name:'CLEANING',active:true,unit:''}],shifts:[{name:'Custom',startTime:'07:00',endTime:'19:00'}],reportPreferences:{reportTitle:'Daily Factory Production Summary',showEmployeeId:true,showProject:true,showRemarks:true}};
const unitFor = name => settings.departments.find(d=>d.name===name)?.unit ?? '';
assert.equal(productionTotals(entries,unitFor),'77 TON / 232 PCS');
assert.equal(productionTotals([...entries,{department:'PTW',weight:12}],unitFor),'77 TON / 232 PCS / 12 KG');
const original = JSON.stringify(entries);
async function renderPage(name, states, props = {}) {
 const source=readFileSync(new URL(`../frontend/src/pages/${name}.jsx`,import.meta.url),'utf8');
 const icons=[...source.matchAll(/import\s*\{([^}]+)\}\s*from "lucide-react"/g)].flatMap(m=>m[1].split(',').map(s=>s.trim().split(/\s+as\s+/).pop()).filter(Boolean));
 const cleaned=source.replace(/\r/g, '').replace(/import[\s\S]*?from ["'][^"']+["'];?\n/g,'').replace(/export default \w+;/,'');
 const {code}=await transformWithOxc(cleaned,`${name}.jsx`,{jsx:{runtime:'classic'}});
 let index=0;
 const context={React,API_URL:'http://test',productionTotals,useSettings:()=>({settings,unitFor,loading:false,error:''}),useState:initial=>[states && index in states ? states[index++] : (index++,typeof initial==='function'?initial():initial),()=>{}],useEffect:()=>{},useMemo:fn=>fn(),console,Date,Set,Map,window:{},...Object.fromEntries(icons.map(n=>[n,()=>null]))};
 vm.createContext(context);
 vm.runInContext(code+`\nglobalThis.Page = ${name};`,context);
 return renderToStaticMarkup(context.Page(props));
}
let html=await renderPage('Reports',['2026-09-30',entries,false]);
for(const text of ['ABC Steel Industries','Chennai Plant','DAILY FACTORY PRODUCTION SUMMARY','EMP007','Project Alpha','Keep this remark','77 TON','232 PCS']) assert.ok(html.includes(text),text);
settings.reportPreferences={...settings.reportPreferences,showEmployeeId:false,showProject:false,showRemarks:false};
html=await renderPage('Reports',['2026-09-30',entries,false]);
for(const text of ['EMP007','Project Alpha','Keep this remark'])assert.ok(!html.includes(text),`hidden ${text}`);
assert.ok(html.includes('Manoj') && html.includes('77 TON'));
html=await renderPage('WorkEntry');
assert.ok(!html.includes('>CNC</strong>'));
assert.ok(html.includes('>Custom</option>'));
settings.departments.forEach(d=>d.active=false);
html=await renderPage('WorkEntry');
assert.ok(html.includes('No active departments are currently available.'));
assert.match(html,/saveActivityButton[^>]*disabled/);
html=await renderPage('Reports',['2026-09-30',entries,false]);
assert.ok(html.includes('77 TON') && html.includes('Manoj'));
for (const page of ['ProductionDashboard','Production','Department','Workers']) {
 const states=page==='Workers'?[entries,false,'','2026-09-30']:page==='Department'?[entries.filter(e=>e.department==='CNC'),false]:[entries,false];
 html=await renderPage(page,states,{department:'CNC'});
 assert.ok(html.includes('CNC'),`${page} retains inactive history`);
 if(page==='Workers') assert.ok(html.includes('EMP007'),'operational employee IDs remain visible');
 else assert.ok(html.includes('77 TON'),`${page} uses configured units`);
}
assert.equal(JSON.stringify(entries),original);
const WorkEntry=require('../backend/models/WorkEntry');
const SystemSettings=require('../backend/models/SystemSettings');
const controller=require('../backend/controllers/workEntryController');
let created=0,updated=0;
SystemSettings.findOne=async()=>settings;
WorkEntry.create=async data=>{created++;return {_id:'new',...data};};
WorkEntry.findById=async()=>entries[0];
WorkEntry.findByIdAndUpdate=async(id,data)=>{updated++;return {...entries[0],...data};};
function response(){return {code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
for(const department of ['CNC','UNKNOWN']){
 const res=response();await controller.createWorkEntry({body:{...entries[0],department,shift:'Custom'}},res);assert.equal(res.code,400);
}
assert.equal(created,0);
settings.departments[0].active=true;
let res=response();await controller.createWorkEntry({body:{...entries[0],shift:'Custom'}},res);assert.equal(res.code,201);assert.equal(res.body.data.hours,30);
settings.departments[0].active=false;
res=response();await controller.updateWorkEntry({params:{id:'old-cnc'},body:{hours:40}},res);assert.equal(res.code,200);assert.equal(updated,1);
SystemSettings.findOne=async()=>null;
res=response();await controller.createWorkEntry({body:entries[0]},res);assert.equal(res.code,503);
console.log('PASS: configured report rendering, preference toggles, historical inactive output, new-entry choices, all-inactive state, mixed units, backend rejection/reactivation, unrestricted hours and historical edit. No database connection used.');

