(() => {
'use strict';
const C=DrawerLayout,$=id=>document.getElementById(id),key='drawer-layout-studio-v1';
let doc=C.createDefault(),selected=doc.cells[0].id,selectedLayer='下层',zoom=1,drag=null,undo=[],redo=[],timer,tool="select",pan=null,center={x:0,y:0},mainView="3d",hasStoredDraft=false;
const schemesKey=key+'-schemes';let schemes=[],activeScheme=null,removedScheme=null;
try{const library=JSON.parse(localStorage.getItem(schemesKey)||'null');if(library?.version===1&&Array.isArray(library.items)){const ids=new Set();for(const item of library.items.slice(0,100)){try{const d=C.parseDocument(item.doc);if(typeof item.id!=='string'||ids.has(item.id)||!C.validate(d).valid)continue;ids.add(item.id);schemes.push({id:item.id,name:d.name,doc:d,updated:Number(item.updated)||Date.now()});}catch{}}activeScheme=schemes.some(s=>s.id===library.active)?library.active:null;if(library.removed?.doc){try{const d=C.parseDocument(library.removed.doc);if(C.validate(d).valid)removedScheme={...library.removed,doc:d,name:d.name};}catch{}}}}catch{}
const preview=new DrawerPreview($("preview"));
const uiKey=key+'-ui';let uiReady=false,uiTimer=null,lastUI='';
function detailKey(el){return el.id||((el.closest('.inspector-pane')?.id||'preview')+':'+el.querySelector('summary')?.textContent.trim());}
function uiDetails(){return [...document.querySelectorAll('.inspector-content details')];}
function persistUI(){
  if(!uiReady)return;clearTimeout(uiTimer);
  const value=JSON.stringify({version:1,pane:document.querySelector('.inspector-tabs [aria-selected="true"]')?.dataset.pane||'cell',mainView,details:Object.fromEntries(uiDetails().map(el=>[detailKey(el),el.open])),camera:{angle:preview.angle,pitch:preview.pitch,zoom:preview.zoom,offset:{...preview.offset}},layout:{zoom,center:{...center}}});
  if(value===lastUI)return;try{localStorage.setItem(uiKey,value);lastUI=value;}catch{}
}
function queueUIState(){if(!uiReady)return;clearTimeout(uiTimer);uiTimer=setTimeout(persistUI,150);}
function restoreUI(){
  try{
    const state=JSON.parse(localStorage.getItem(uiKey)||'null');if(state?.version!==1)return;
    const bounded=(value,min,max,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
    mainView=state.mainView==='2d'?'2d':'3d';placeViews();
    if(['cell','layout','settings'].includes(state.pane))showInspector(state.pane);
    for(const el of uiDetails())if(typeof state.details?.[detailKey(el)]==='boolean')el.open=state.details[detailKey(el)];
    const c=state.camera||{},v=state.layout||{};
    preview.angle=bounded(c.angle,-1e6,1e6,preview.angle);preview.pitch=bounded(c.pitch,.2,Math.PI/2,preview.pitch);preview.zoom=bounded(c.zoom,.5,3,1);
    preview.offset={x:bounded(c.offset?.x,-10000,10000,0),y:bounded(c.offset?.y,-10000,10000,0)};
    zoom=bounded(v.zoom,.6,3,1);center={x:bounded(v.center?.x,-10000,10000,0),y:bounded(v.center?.y,-10000,10000,0)};
  }catch{}
}
function syncCameraButtons(){
 const top=Math.abs(preview.pitch-Math.PI/2)<.001,delta=Math.atan2(Math.sin(preview.angle+Math.PI/4),Math.cos(preview.angle+Math.PI/4)),iso=Math.abs(preview.pitch-Math.atan(1/Math.sqrt(2)))<.001&&Math.abs(delta)<.001;
 $('camera-top').setAttribute('aria-pressed',String(top));$('camera-iso').setAttribute('aria-pressed',String(iso));
}
const originalSchedule=preview.schedule.bind(preview);preview.schedule=()=>{originalSchedule();syncCameraButtons();queueUIState();};
document.addEventListener('toggle',e=>{if(uiDetails().includes(e.target))queueUIState();},true);
window.addEventListener('pagehide',persistUI);document.addEventListener('visibilitychange',()=>{if(document.hidden)persistUI();});
preview.onSelect=(id,layer)=>{selected=id;selectedLayer=layer==='上层'?'上层':'下层';showInspector('cell');render();};
let hoverTimer=null,hoverKey=null,hoverEvent=null;
preview.onHover=(hit,event)=>{
  const info=$('cell-hover-info');if(!hit){clearTimeout(hoverTimer);hoverTimer=null;hoverKey=null;hoverEvent=null;info.hidden=true;return;}
  hoverEvent=event;const key=hit.id+hit.layer;
  const show=()=>{const index=doc.cells.findIndex(c=>c.id===hit.id);if(index<0)return;info.textContent='格子 '+String(index+1).padStart(2,'0')+' · '+hit.layer+'\n外部 '+hit.width.toFixed(2)+' × '+hit.depth.toFixed(2)+' × '+hit.height.toFixed(2)+' mm';info.hidden=false;const bounds=$('three-view').getBoundingClientRect();info.style.left=Math.max(8,Math.min(bounds.width-info.offsetWidth-8,hoverEvent.clientX-bounds.left+16))+'px';info.style.top=Math.max(8,Math.min(bounds.height-info.offsetHeight-8,hoverEvent.clientY-bounds.top+16))+'px';};
  if(key!==hoverKey){clearTimeout(hoverTimer);hoverKey=key;info.hidden=true;hoverTimer=setTimeout(show,300);}else if(!info.hidden)show();
};

$("preview-reset").onclick=()=>preview.reset();$("camera-top").onclick=()=>preview.setView("top");$("camera-iso").onclick=()=>preview.setView("iso");
document.querySelector('.preview-card>summary').addEventListener('click',e=>{if(!e.target.closest('button'))e.preventDefault();});
document.querySelector(".preview-card").addEventListener("toggle",()=>draw());
function placeViews(){
  const three=mainView==='3d';
  $('main-stage').prepend($(three?'three-view':'layout-view'));
  $('mini-stage').prepend($(three?'layout-view':'three-view'));
  document.querySelector('.workspace').dataset.mainView=mainView;
  $('mini-view-title').textContent=three?'二维预览':'三维预览';
  $('main-view-label').textContent=three?'三维视图':'二维布局';
  $('mini-view-hint').textContent=three?(doc.layers===2?'点击选择 · 虚线框为上层':'点击格子选择 · 切换后拖动编辑'):'点击盒子选择 · 同步编辑属性';
  $('swap-views').setAttribute('aria-label',three?'切换到二维主视图':'切换到三维主视图');
}
$('swap-views').onclick=event=>{event.preventDefault();event.stopPropagation();endDrag(true);mainView=mainView==='3d'?'2d':'3d';placeViews();draw();};
placeViews();
function showInspector(name){document.querySelectorAll('.inspector-tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.pane===name)));document.querySelectorAll('.inspector-pane').forEach(p=>p.hidden=p.id!=='pane-'+name);document.querySelector('.inspector-content').scrollTop=0;queueUIState();}
document.querySelectorAll('[data-pane]').forEach(b=>b.onclick=()=>showInspector(b.dataset.pane));
function setTool(value){tool=value;preview.tool=value;$("select").classList.toggle("active",value==="select");$("pan").classList.toggle("active",value==="pan");$("canvas").classList.toggle("pan-mode",value==="pan");draw();}
$("select").onclick=()=>setTool("select");$("pan").onclick=()=>setTool("pan");
$("drawer-shortcut").onclick=()=>showDrawerSetup();
$("drawer-setup").onclick=()=>showDrawerSetup();
try{const stored=localStorage.getItem(key);if(stored){doc=C.parseDocument(stored,{allowEmpty:true});hasStoredDraft=true;}}catch{}if(!hasStoredDraft&&activeScheme){doc=C.clone(schemes.find(s=>s.id===activeScheme).doc);hasStoredDraft=true;}if(!hasStoredDraft)doc.cells=[];selected=doc.cells[0]?.id;doc.settings.drawer_display='SOLID';
if(doc.layers===2&&!doc.settings.upper_height){doc.settings.upper_height=doc.settings.height;save();}
if(doc.layers===1&&C.heightLimit(doc)>doc.settings.base+.2){const height=C.round(Math.max(doc.settings.base+.2,Math.min(doc.settings.height,C.heightLimit(doc))));if(height!==doc.settings.height){doc.settings.height=height;save();}}
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v.toFixed(2));
function toast(t){$('toast').textContent=t;$('toast').classList.add('visible');clearTimeout(timer);timer=setTimeout(()=>$('toast').classList.remove('visible'),3500);}
function remember(){undo.push(C.clone(doc));if(undo.length>50)undo.shift();redo=[];}
function storeSchemes(){localStorage.setItem(schemesKey,JSON.stringify({version:1,active:activeScheme,items:schemes,removed:removedScheme}));}
function save(){try{localStorage.setItem(key,JSON.stringify(doc));const scheme=schemes.find(s=>s.id===activeScheme);if(scheme){scheme.doc=C.clone(doc);scheme.name=doc.name;scheme.updated=Date.now();}storeSchemes();}catch{$('scheme-message').textContent='本机保存失败，请导出布局备份后重试。';}}

function commit(fn){remember();fn();save();render();}
function schemeId(){return 'scheme-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);}
function schemeThumbnail(data){const p=data.settings,stroke=Math.max(p.width,p.depth)*.003;return `<svg viewBox="${-p.width/2} ${-p.depth/2} ${p.width} ${p.depth}" aria-hidden="true">${data.cells.map(c=>`<rect x="${c.x-c.width/2}" y="${-c.y-c.depth/2}" width="${c.width}" height="${c.depth}" rx="${p.radius}" fill="#596b63" stroke="#b3bdb6" stroke-width="${stroke}"/>`).join('')}</svg>`;}
function renderSchemes(){
  $('scheme-list').innerHTML=schemes.length?schemes.map(s=>`<article class="scheme-row ${s.id===activeScheme?'is-current':''}" data-scheme="${esc(s.id)}"><div class="scheme-thumb">${schemeThumbnail(s.doc)}</div><div class="scheme-details"><label><input class="scheme-name" aria-label="方案名称" maxlength="80" value="${esc(s.name)}" data-scheme-name="${esc(s.id)}"></label><p>${s.doc.settings.width} × ${s.doc.settings.depth} × ${s.doc.settings.drawer_height} mm · ${s.doc.layers===2?'双层':'单层'} · ${s.doc.cells.length} 格${s.id===activeScheme?' · 当前方案':''}</p><div class="scheme-actions"><button type="button" data-scheme-open="${esc(s.id)}">${s.id===activeScheme?'正在编辑':'打开'}</button><button type="button" data-scheme-copy="${esc(s.id)}">复制</button><button type="button" data-scheme-delete="${esc(s.id)}">删除</button></div></div></article>`).join(''):'<p class="empty">还没有常用方案。为当前布局起个名字，保存后即可随时切换。</p>';
  $('scheme-restore').hidden=!removedScheme;
  document.querySelectorAll('[data-scheme-open]').forEach(b=>b.onclick=()=>{const target=schemes.find(s=>s.id===b.dataset.schemeOpen);if(!target)return;if(target.id===activeScheme){$('schemes-dialog').close();return;}save();if(!activeScheme&&doc.drawerConfigured&&C.validate(doc).valid){if(schemes.length>=100){$('scheme-message').textContent='请先导出当前草稿，方案数量已达100。';return;}const draft=C.clone(doc);draft.name=draft.name.slice(0,76)+'（草稿）';schemes.push({id:schemeId(),name:draft.name,doc:draft,updated:Date.now()});}doc=C.clone(target.doc);activeScheme=target.id;hasStoredDraft=true;selected=doc.cells[0]?.id;selectedLayer='下层';undo=[];redo=[];preview.clearHover();preview.frame=null;save();render();$('schemes-dialog').close();toast('已切换到 '+doc.name);});
  document.querySelectorAll('[data-scheme-name]').forEach(input=>input.onchange=()=>{const target=schemes.find(s=>s.id===input.dataset.schemeName),name=input.value.trim();if(!target||!name){renderSchemes();return;}target.name=name;target.doc.name=name;target.updated=Date.now();if(target.id===activeScheme){doc.name=name;save();render();}try{storeSchemes();renderSchemes();}catch{$('scheme-message').textContent='保存失败，请先导出备份。';}});
  document.querySelectorAll('[data-scheme-copy]').forEach(b=>b.onclick=()=>{try{if(schemes.length>=100)throw new Error('最多保存100个方案');const source=schemes.find(s=>s.id===b.dataset.schemeCopy),copy=C.clone(source);copy.id=schemeId();copy.name=source.name.slice(0,77)+' 副本';copy.doc.name=copy.name;copy.updated=Date.now();schemes.push(copy);storeSchemes();renderSchemes();$('scheme-message').textContent='已复制为 '+copy.name;}catch(e){$('scheme-message').textContent=e.message;}});
  document.querySelectorAll('[data-scheme-delete]').forEach(b=>b.onclick=()=>{const index=schemes.findIndex(s=>s.id===b.dataset.schemeDelete);if(index<0)return;removedScheme=C.clone(schemes[index]);schemes.splice(index,1);if(activeScheme===removedScheme.id)activeScheme=null;save();renderSchemes();$('scheme-message').textContent='方案已删除，可撤销；当前画布保留。';});
}
$('schemes-open').onclick=()=>{endDrag(false);save();$('scheme-new-name').value=doc.name;$('scheme-save').disabled=!doc.drawerConfigured||!C.validate(doc).valid;$('scheme-message').textContent='';renderSchemes();$('schemes-dialog').showModal();};
$('schemes-close').onclick=()=>$('schemes-dialog').close();
$('scheme-save-form').onsubmit=e=>{e.preventDefault();try{if(schemes.length>=100)throw new Error('最多保存100个方案');const data=C.parseDocument(doc),v=C.validate(data);if(!doc.drawerConfigured||!v.valid)throw new Error(v.errors[0]||'请先完成抽屉设置');save();data.name=$('scheme-new-name').value.trim()||doc.name;const entry={id:schemeId(),name:data.name,doc:data,updated:Date.now()};schemes.push(entry);activeScheme=entry.id;storeSchemes();doc=C.clone(data);save();render();renderSchemes();$('scheme-message').textContent='已保存，后续修改会自动保存到此方案。';}catch(error){$('scheme-message').textContent=error.message;}};
$('scheme-restore').onclick=()=>{if(!removedScheme)return;if(schemes.length>=100){$('scheme-message').textContent='方案数量已达100，请先移除一个方案。';return;}if(!schemes.some(s=>s.id===removedScheme.id))schemes.push(removedScheme);removedScheme=null;storeSchemes();renderSchemes();$('scheme-message').textContent='已恢复删除的方案。';};
function layoutInputOptions(){return {mode:$('layout-mode').value,columns:$('layout-cols').valueAsNumber,rows:$('layout-rows').valueAsNumber,count:$('layout-random-count').valueAsNumber,minSize:$('layout-min-size').valueAsNumber,seed:$('layout-seed').valueAsNumber,columnRatios:doc.layout?.columnRatios||'',rowRatios:doc.layout?.rowRatios||''};}
function liveParameterDocument(base,input,value){
  if(input.id.startsWith('layout-'))return C.createLayout(base,layoutInputOptions());
  const key=input.dataset.setting,[lo,hi]=C.ranges[key];if(!Number.isFinite(value)||value<lo||value>hi||key==='segments'&&!Number.isInteger(value))throw new Error('数值超出允许范围');
  if(['width','depth','drawer_height'].includes(key))return C.resizeDrawer(base,{[key]:value});
  if(['gap','margin'].includes(key))return C.fitToDrawer(base,{[key]:value});
  const next=C.clone(base);next.settings[key]=value;if(['upper_depth_ratio','slide_clearance','slide_position','upper_height'].includes(key))next.cells.forEach(c=>delete c[key]);if(key==='height')next.cells.forEach(c=>c.height=value);
  const result=C.validate(next);if(!result.valid)throw new Error(result.errors[0]);return next;
}
function enhanceNumberControls(){
  document.querySelectorAll('input[type="number"]').forEach(input=>{
    if(input.closest('.dimension-control')||input.closest('#onboarding-dialog'))return;
    let control=input.closest('.number-control');
    if(!control){
      const key=input.dataset.setting||input.id,integer=/cols|rows|count|seed|segments/.test(key),ratio=/ratio|slide_position/.test(key),unit=integer?(key.includes('rows')?'行':key.includes('cols')?'列':key.includes('count')?'格':''):ratio?'':'mm',axis=/width|bed_x/.test(key)?'W':/depth|bed_y/.test(key)?'L':/height|bed_z/.test(key)?'H':'';
      control=document.createElement('span');control.className='number-control';input.before(control);
      const box=document.createElement('span');box.className='number-box';if(axis){const prefix=document.createElement('span');prefix.className='dimension-axis';prefix.textContent=axis;box.append(prefix);}box.append(input);if(unit){const suffix=document.createElement('span');suffix.className='dimension-unit';suffix.textContent=unit;box.append(suffix);}control.append(box);
      const slider=document.createElement('input');slider.type='range';slider.className='dimension-slider parameter-slider';slider.id=input.id+'-slider';slider.setAttribute('aria-label','滑动调整'+(input.getAttribute('aria-label')||input.closest('label')?.firstChild?.textContent?.trim()||'参数'));control.append(slider);
      const liveDrawer=['width','depth','drawer_height'].includes(input.dataset.setting),liveParameter=!!input.dataset.setting||input.id.startsWith('layout-');if(input.id==='layout-seed'||liveDrawer||['bed_x','bed_y','bed_z','drawer_wall','drawer_base','drawer_radius'].includes(input.dataset.setting)){slider.hidden=true;slider.removeAttribute('aria-label');}let snapshot=null,frame=null,pending=null,lastError='';
      const applyLive=()=>{frame=null;if(!snapshot||pending===null)return;try{const next=liveParameterDocument(snapshot,input,pending);doc=next;selected=doc.cells.some(c=>c.id===selected)?selected:doc.cells[0]?.id;lastError='';const c=doc.cells.find(c=>c.id===selected);if(c)for(const k of ['width','depth','height']){const field=$('cell-'+k);if(field)field.value=Number(c[k].toFixed(2));}draw();}catch(e){lastError=e.message;}};
      const finishLive=cancel=>{if(!snapshot)return;if(frame!==null){cancelAnimationFrame(frame);frame=null;}if(!cancel)applyLive();const before=snapshot;snapshot=null;pending=null;if(cancel)doc=before;else if(JSON.stringify(doc)!==JSON.stringify(before)){undo.push(before);if(undo.length>50)undo.shift();redo=[];save();}if(lastError&&!cancel)toast('未采用该尺寸：'+lastError);lastError='';render();};
      input.addEventListener('input',()=>{slider.value=input.value;if(!liveParameter)return;snapshot??=C.clone(doc);pending=input.valueAsNumber;if(frame===null)frame=requestAnimationFrame(applyLive);});
      input.addEventListener('change',e=>{if(liveParameter&&snapshot){e.stopImmediatePropagation();finishLive(false);}},true);
      slider.addEventListener('input',()=>{input.value=slider.value;input.dispatchEvent(new Event('input',{bubbles:true}));});
      slider.addEventListener('change',()=>{if(liveParameter)finishLive(false);else{input.dispatchEvent(new Event('change',{bubbles:true}));enhanceNumberControls();}});
      slider.addEventListener('pointercancel',()=>{if(liveParameter)finishLive(true);});
      slider.addEventListener('blur',()=>{if(liveParameter)finishLive(false);});
      slider.dataset.integer=integer?'1':'0';
    }
    const slider=control.querySelector('input[type="range"]');let min=input.min?Number(input.min):0,max=input.max?Number(input.max):100,step=input.step&&input.step!=='any'?Number(input.step):slider.dataset.integer==='1'?1:.1;
    if(input.dataset.setting==='height'){min=Math.max(min,doc.layers===2?7:doc.settings.base+.2);max=Math.min(max,C.heightLimit(doc));}
    if(input.dataset.setting==='upper_height'){min=doc.settings.base+.2;max=Math.min(max,doc.settings.bed_z,doc.settings.drawer_height-doc.settings.height);}
    if(input.dataset.setting==='chamfer_size')max=Math.min(max,C.chamferLimit(doc));
    slider.min=Math.ceil(min/step)*step;slider.max=Math.max(Number(slider.min),Math.floor(max/step)*step);slider.step=step;slider.value=input.value;slider.disabled=input.disabled||max<=min;
  });
}
function fields(id,items){$(id).innerHTML=items.map(([k,label])=>`<label>${label}<input data-setting="${k}" id="setting-${k}" type="number" min="${C.ranges[k][0]}" max="${C.ranges[k][1]}" step="${k==='segments'?1:.1}" aria-label="${label}"></label>`).join('');}
fields('drawer-fields',[['width','宽度 W'],['depth','长度 L'],['drawer_height','净高度 H']]);
fields('spacing-fields',[['margin','四周间隙'],['gap','盒间间隙'],['height','默认盒高'],['upper_height','上层高度']]);
fields('structure-fields',[['wall','壁厚'],['base','底厚'],['radius','平面圆角'],['segments','圆角分段']]);
fields('chamfer-field',[['chamfer_size','倒角宽度']]);fields('printer-fields',[['bed_x','打印 W'],['bed_y','打印 L'],['bed_z','打印 H']]);
fields('shell-fields',[['drawer_wall','抽屉壁厚'],['drawer_base','抽屉底厚'],['drawer_radius','外圆角半径']]);
document.querySelectorAll('[data-setting]').forEach(input=>input.addEventListener('change',()=>{const k=input.dataset.setting,v=input.valueAsNumber,[lo,hi]=C.ranges[k];if(!Number.isFinite(v)||v<lo||v>hi||k==='segments'&&!Number.isInteger(v)){toast('数值须在 '+lo+' 至 '+hi+' 之间');render();return;}if(['width','depth','drawer_height','gap','margin'].includes(k)){
  try{const fitted=(["width","depth","drawer_height"].includes(k)?C.resizeDrawer:C.fitToDrawer)(doc,{[k]:v});commit(()=>{doc=fitted;selected=doc.cells.some(c=>c.id===selected)?selected:doc.cells[0]?.id;zoom=1;center={x:0,y:0};preview.fit();});toast('净尺寸已应用，布局已自动适配，共 '+doc.cells.length+' 格，可撤销');}catch(e){toast(e.message);render();}
}else if(['bed_x','bed_y','bed_z','height','base','wall','radius','upper_depth_ratio','slide_clearance','slide_position'].includes(k)){
  if(k==='height'&&(v<=doc.settings.base||v>C.heightLimit(doc))){toast('默认盒高须大于底厚，且不超过 '+C.heightLimit(doc)+' mm');render();return;}const next=C.clone(doc);next.settings[k]=v;if(k==='height')next.cells.forEach(c=>c.height=v);
  const printErrors=next.cells.flatMap(c=>C.cellErrors(next,c).filter(e=>e.includes('打印空间')||e.includes('上层超过')));
  if(printErrors.length){toast('未修改：'+printErrors[0]+'；请先增加分格数量或减小格子');render();return;}commit(()=>{doc=next;});
}else commit(()=>{doc.settings[k]=v;});}));
let lastLayoutConfig;
function restoreLayoutOptions(){const o=doc.layout??C.layoutDefaults,serialized=JSON.stringify(o);if(serialized===lastLayoutConfig)return;lastLayoutConfig=serialized;$('layout-mode').value=o.mode==='CUSTOM'?(doc.layers===2?'DOUBLE_':'')+(doc.cells.some(c=>c.id.startsWith('random-'))?'RANDOM':'GRID'):o.mode;for(const [id,k]of [['layout-cols','columns'],['layout-rows','rows'],['layout-random-count','count'],['layout-min-size','minSize'],['layout-seed','seed']])$(id).value=o[k];}
function layoutCount(){const mode=$('layout-mode').value,random=mode.endsWith('RANDOM'),custom=mode==='CUSTOM',cols=$('layout-cols').valueAsNumber,rows=$('layout-rows').valueAsNumber;$('layout-grid-options').hidden=random||custom;$('layout-random-options').hidden=!random;$('layout-custom-note').hidden=!custom;$('layout-replace-note').hidden=custom;$('layout-apply').textContent=custom?'进入自定义布局':random?'应用随机布局':'应用分格数量';}
$('layout-mode').onchange=()=>{layoutCount();applyLayout();};for(const id of ['layout-cols','layout-rows','layout-random-count'])$(id).oninput=layoutCount;
function applyLayout(reroll=false){try{const o={mode:$('layout-mode').value,columns:$('layout-cols').valueAsNumber,rows:$('layout-rows').valueAsNumber,count:$('layout-random-count').valueAsNumber,minSize:$('layout-min-size').valueAsNumber,seed:$('layout-seed').valueAsNumber,columnRatios:doc.layout?.columnRatios||'',rowRatios:doc.layout?.rowRatios||''};if(reroll)o.seed=(o.seed+1)%2147483648;const next=C.createLayout(doc,o);commit(()=>{doc=next;selected=doc.cells.some(c=>c.id===selected)?selected:doc.cells[0]?.id;preview.fit();if(o.mode==='CUSTOM'){mainView='2d';placeViews();zoom=1;center={x:0,y:0};}});toast(o.mode==='CUSTOM'?'已进入自定义布局，可拖动吸附编辑':'已更新为 '+doc.cells.length+' 格'+(doc.layers===2?'（双层，L 方向滑动）':'')+'，可撤销');}catch(e){toast(e.message);}}
$('layout-apply').onclick=()=>applyLayout();$('layout-reroll').onclick=()=>applyLayout(true);

$('drawer-visible').onchange=()=>commit(()=>{doc.settings.drawer_visible=$('drawer-visible').checked;});
$('chamfer').onchange=()=>commit(()=>{doc.settings.chamfer_enabled=$('chamfer').checked;});
$('rename').onclick=()=>{$('project-name').focus();$('project-name').select();};
let nameBefore=null;$('project-name').oninput=()=>{nameBefore??=C.clone(doc);doc.name=$('project-name').value.trim()||'我的抽屉';};$('project-name').onchange=()=>{if(!nameBefore)return;const before=nameBefore;nameBefore=null;if(JSON.stringify(doc)!==JSON.stringify(before)){undo.push(before);redo=[];save();}render();};
function draw(){const p=doc.settings,canvas=$('canvas'),mini=mainView==='3d',pad=Math.max(Math.max(p.width,p.depth)*(mini?.05:.28)+(mini?6:25),p.drawer_visible?p.drawer_wall+10:0),viewZoom=mini?1:zoom,viewCenter=mini?{x:0,y:0}:center,vw=(p.width+pad*2)/viewZoom,vh=(p.depth+pad*2)/viewZoom;canvas.setAttribute('viewBox',`${viewCenter.x-vw/2} ${viewCenter.y-vh/2} ${vw} ${vh}`);
const scale=Math.max(p.width,p.depth)/360,fs=9*scale,sw=.65*scale,m=C.margin(p),validation=C.validate(doc);
let s=`<defs><pattern id="fine-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#343434" stroke-width="${.18*scale}"/></pattern><pattern id="major-grid" width="25" height="25" patternUnits="userSpaceOnUse"><rect width="25" height="25" fill="url(#fine-grid)"/><path d="M25 0H0V25" fill="none" stroke="#3c3c3c" stroke-width="${.3*scale}"/></pattern></defs>${p.drawer_visible?`<rect data-drawer-shell="true" x="${-p.width/2-p.drawer_wall}" y="${-p.depth/2-p.drawer_wall}" width="${p.width+2*p.drawer_wall}" height="${p.depth+2*p.drawer_wall}" rx="${Math.min(p.drawer_radius,(p.width+2*p.drawer_wall)/2,(p.depth+2*p.drawer_wall)/2)}" fill="${p.drawer_display==='WIRE'?'none':'#66727d'}" stroke="#a0b1bf" stroke-width="${sw}"/>`:''}<rect data-board="true" x="${-p.width/2}" y="${-p.depth/2}" width="${p.width}" height="${p.depth}" rx="${Math.max(4*scale,p.drawer_radius-p.drawer_wall)}" fill="#282828"/><rect x="${-p.width/2}" y="${-p.depth/2}" width="${p.width}" height="${p.depth}" rx="${Math.max(4*scale,p.drawer_radius-p.drawer_wall)}" fill="url(#major-grid)"/><rect x="${-p.width/2+m}" y="${-p.depth/2+m}" width="${Math.max(0,p.width-2*m)}" height="${Math.max(0,p.depth-2*m)}" fill="none" stroke="#535d55" stroke-width="${sw}" stroke-dasharray="3 3"/>`;
const colors=['#505d56','#54605a','#5c6255','#505e5c','#606154'];
const indices=doc.cells.map((_,i)=>i).sort((a,b)=>(doc.cells[a].id===selected)-(doc.cells[b].id===selected));
for(const i of indices){const c=doc.cells[i],active=c.id===selected&&(doc.layers!==2||selectedLayer==='下层'),bad=!!validation.byCell[i],x=c.x-c.width/2,y=-c.y-c.depth/2,r=Math.min(p.radius,c.width/2,c.depth/2);s+=`<g data-index="${i}" class="box"><rect x="${x}" y="${y}" width="${c.width}" height="${c.depth}" rx="${Math.max(0,r)}" fill="${bad?'#704a41':active?'#786b3c':colors[i%colors.length]}" stroke="${bad?'#d9957c':active?'#dfca87':'#748a79'}" stroke-width="${active?1.6*scale:sw}"/>`;
if(doc.layers===2){const u=C.slide(p,c);if(u.width>0&&u.depth>0)s+=`<rect x="${u.x-u.width/2}" y="${-u.y-u.depth/2}" width="${u.width}" height="${u.depth}" rx="${u.radius}" data-layer="上层" fill="${c.id===selected&&selectedLayer==='上层'?'#b29c58b3':'#151d1640'}" stroke="${c.id===selected&&selectedLayer==='上层'?'#efd16b':'#96b69d'}" stroke-dasharray="${3*scale} ${2*scale}" stroke-width="${c.id===selected&&selectedLayer==='上层'?1.6*scale:sw}"/>`;}
if(c.width>fs*2.4&&c.depth>fs*3)s+=`<text x="${c.x}" y="${-c.y-fs*.55}" text-anchor="middle" fill="#d3e4d6" font-size="${fs*1.4}" font-weight="600" pointer-events="none">${String(i+1).padStart(2,'0')}</text><text x="${c.x}" y="${-c.y+fs*1.2}" text-anchor="middle" fill="#a5baa9" font-size="${fs*.85}" pointer-events="none">${num(c.width)} × ${num(c.depth)}</text>`;
if(active)s+=`<rect class="resize" data-handle="resize" x="${x+c.width-3.8*scale}" y="${y-3.8*scale}" width="${7.6*scale}" height="${7.6*scale}" rx="${1.6*scale}" fill="#fff" stroke="#42d476" stroke-width="${sw}"/>`;s+='</g>';}
if(drag?.axes){const c=doc.cells[drag.index];if(drag.axes[0])s+=`<path d="M ${c.x} ${-p.depth/2-8*scale} V ${p.depth/2+8*scale}" stroke="#42d476" stroke-width="${sw}" stroke-dasharray="2 3" pointer-events="none"/>`;if(drag.axes[1])s+=`<path d="M ${-p.width/2-8*scale} ${-c.y} H ${p.width/2+8*scale}" stroke="#42d476" stroke-width="${sw}" stroke-dasharray="2 3" pointer-events="none"/>`;}
s+=`<text x="0" y="${-p.depth/2-10*scale}" text-anchor="middle" fill="#878f88" font-size="${fs}">${num(p.width)} mm / W</text><text x="${-p.width/2-11*scale}" y="0" text-anchor="middle" transform="rotate(-90 ${-p.width/2-11*scale} 0)" fill="#878f88" font-size="${fs}">${num(p.depth)} mm / L</text>`;canvas.innerHTML=s;
$('board-size').textContent=`${num(p.width)} × ${num(p.depth)} mm`;
const board=canvas.querySelector('[data-board]').getBoundingClientRect(),frame=canvas.getBoundingClientRect(),badge=$('board-size').parentElement;
badge.style.transform='none';badge.style.left=Math.max(12,board.left-frame.left)+'px';badge.style.top=Math.max(12,board.top-frame.top-42)+'px';
preview.update(doc,selected,doc.layers===2?selectedLayer:'单层');
}
function sliderDocument(base,id,key,value){
  if(key==='width'||key==='depth')return C.adaptCell(base,id,key,value);
  const next=C.clone(base);if(key==='radius')next.settings.radius=value>0&&value<=next.settings.wall?next.settings.wall+.01:value;else next.cells.find(c=>c.id===id)[key]=value;
  const result=C.validate(next);if(!result.valid)throw new Error(result.errors[0]);return next;
}
function sliderBounds(base,id,key,range,current,step=.1){
  const valid=value=>{try{sliderDocument(base,id,key,value);return true;}catch{return false;}};
  if(!valid(current))return [current,current];
  let min=range[0],max=range[1];
  if(!valid(min)){let bad=min,good=current;for(let i=0;i<22;i++){const mid=(bad+good)/2;if(valid(mid))good=mid;else bad=mid;}min=good;}
  if(!valid(max)){let good=current,bad=max;for(let i=0;i<22;i++){const mid=(bad+good)/2;if(valid(mid))good=mid;else bad=mid;}max=good;}
  min=Math.ceil(min/step)*step;max=Math.floor(max/step)*step;
  if(min>max)return [current,current];return [min,max];
}
function render(){$('mini-view-hint').textContent=mainView==='3d'?(doc.layers===2?'点击选择 · 虚线框为上层':'点击格子选择 · 切换后拖动编辑'):'点击盒子选择 · 同步编辑属性';const upperOpen=document.querySelector('.selected-upper')?.open;const p=doc.settings,v=C.validate(doc);const heightLabel=$('setting-height').closest('label');heightLabel.firstChild.textContent=doc.layers===2?'下层高度':'默认盒高';const upperLabel=$('setting-upper_height').closest('label');upperLabel.hidden=doc.layers!==2;restoreLayoutOptions();layoutCount();$('drawer-visible').checked=p.drawer_visible;$('shell-options').hidden=!p.drawer_visible;$('project-name').value=doc.name;$('chamfer').checked=p.chamfer_enabled;$('chamfer-field').hidden=!p.chamfer_enabled;document.querySelectorAll('[data-setting]').forEach(el=>el.value=p[el.dataset.setting]);$('export-stl').disabled=!v.valid||!doc.drawerConfigured;$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;
$('validation').hidden=v.valid||!doc.drawerConfigured;$('validation').textContent=v.valid?'':`请调整布局：${v.errors.slice(0,2).join('；')}${v.errors.length>2?'（另有 '+(v.errors.length-2)+' 项）':''}`;$('validation').className=v.valid?'':'invalid';
const c=doc.cells.find(c=>c.id===selected),i=doc.cells.indexOf(c);
const dimension=(id,axis,value,label,attrs='')=>{const key=id==='property-radius'?'radius':id.replace('cell-','');const step=['upper_depth_ratio','slide_clearance','slide_position'].includes(key)?.01:.1,range=key==='upper_height'?[p.base+.2,Math.min(p.bed_z,p.drawer_height-c.height)]:['upper_depth_ratio','slide_clearance','slide_position'].includes(key)?C.ranges[key]:key==='radius'?[0,Math.max(0,Math.min(100,...doc.cells.map(c=>Math.min(c.width,c.depth)/2-.02)))]:key==='height'?[doc.layers===2?Math.max(7,p.base+.2):p.base+.2,C.heightLimit(doc,c)]:[Math.max(4,2*p.wall+.21,2*p.radius+.02),Math.min(key==='width'?p.width:p.depth,Math.max(p.bed_x,p.bed_y))];const bounds=sliderBounds(doc,c.id,key,range,value,step);return `<div class="dimension-control"><label class="dimension-input"><span class="dimension-axis">${axis}</span><input id="${id}" type="number" step="${step}" value="${Number(value.toFixed(2))}" aria-label="${label}" ${attrs}><span class="dimension-unit">${['upper_depth_ratio','slide_position'].includes(key)?'':'mm'}</span></label><input class="dimension-slider" id="slider-${key}" data-slider="${key}" type="range" min="${bounds[0]}" max="${bounds[1]}" step="${step}" value="${value}" aria-label="滑动调整${label}" ${attrs.includes('disabled')||bounds[0]===bounds[1]?'disabled':''}></div>`;};
const upperSelected=doc.layers===2&&selectedLayer==='上层',u=c?C.slide(p,c):null;
const layerTabs=c&&doc.layers===2?`<div class="layer-selection" aria-label="编辑层"><button type="button" data-edit-layer="下层" class="${!upperSelected?'active':''}">下层</button><button type="button" data-edit-layer="上层" class="${upperSelected?'active':''}">上层</button></div>`:'';
const upperControls=c?`${[['upper_height','上层高度','H',C.upperHeight(p,c)],['upper_depth_ratio','长度比例','',c.upper_depth_ratio??p.upper_depth_ratio],['slide_position','滑动位置','',c.slide_position??p.slide_position],['slide_clearance','定位间隙','',c.slide_clearance??p.slide_clearance]].map(([k,l,a,v])=>`<div class="property-row"><span>${l}</span><div class="dimension-pair single">${dimension('cell-'+k,a,v,l,`data-cell="${k}"`)}</div></div>`).join('')}`:'';
$('selection').innerHTML=c?`<div class="selection-head">格子 ${String(i+1).padStart(2,'0')}${doc.layers===2?' · '+selectedLayer:''}</div>${layerTabs}${upperSelected?`<div class="property-row"><span>上层外尺寸</span><div class="dimension-pair"><div class="dimension-input"><span class="dimension-axis">W</span><span id="selected-upper-width">${num(u.width)}</span><span class="dimension-unit">mm</span></div><div class="dimension-input"><span class="dimension-axis">L</span><span id="selected-upper-depth">${num(u.depth)}</span><span class="dimension-unit">mm</span></div></div></div>${upperControls}`:`<div class="property-row"><span>外部尺寸</span><div class="dimension-pair">${dimension('cell-width','W',c.width,'宽度 W','data-cell="width"')}${dimension('cell-depth','L',c.depth,'长度 L','data-cell="depth"')}</div></div><div class="property-row"><span>${doc.layers===2?'下层高度':'盒子高度'}</span><div class="dimension-pair single">${dimension('cell-height','H',c.height,'盒子高度','data-cell="height"')}</div></div>`}`:'<p class="empty">点击画布中的格子，编辑它的尺寸。</p>';
$('selected-upper-panel').innerHTML='';
document.querySelectorAll('[data-edit-layer]').forEach(b=>b.onclick=()=>{selectedLayer=b.dataset.editLayer;render();});

if(c){document.querySelectorAll('[data-cell]').forEach(input=>input.onchange=()=>{const k=input.dataset.cell,value=input.valueAsNumber;if(['width','depth'].includes(k)){try{const next=C.adaptCell(doc,c.id,k,value);commit(()=>{doc=next;});toast('格子尺寸已修改，相邻格子已自动适配，可撤销');}catch(e){toast('未修改：'+e.message);render();}return;}const candidate={...c,[k]:value};const errors=C.cellErrors(doc,candidate);if(!Number.isFinite(value)||errors.length||!C.fits(doc,candidate,i)){toast('未修改：'+(errors[0]||'与其他格子重叠或间隙不足'));render();return;}commit(()=>{c[k]=C.round(value);});});bindDimensionSliders();}

const area=doc.cells.reduce((n,c)=>n+c.width*c.depth,0);$('stats').textContent=`${doc.cells.length*doc.layers} 个盒子 · ${doc.layers} 层 · 占用 ${num(area/(p.width*p.depth)*100)}% · 打印 ${p.bed_x} × ${p.bed_y} × ${p.bed_z} mm`;enhanceNumberControls();draw();}
function bindDimensionSliders(){
  document.querySelectorAll('[data-slider]').forEach(slider=>{let snapshot=null,lastError='';
    const finish=cancel=>{if(!snapshot)return;const before=snapshot;snapshot=null;if(cancel)doc=before;else if(JSON.stringify(doc)!==JSON.stringify(before)){undo.push(before);if(undo.length>50)undo.shift();redo=[];save();}if(lastError&&!cancel)toast('已停在可用尺寸：'+lastError);render();};
    const numeric=$(slider.dataset.slider==='radius'?'property-radius':'cell-'+slider.dataset.slider);
    const apply=e=>{snapshot??=C.clone(doc);const key=slider.dataset.slider,value=e.target===numeric?numeric.valueAsNumber:slider.valueAsNumber;try{let next;
      next=sliderDocument(snapshot,selected,key,value);
      doc=next;lastError='';const cell=doc.cells.find(c=>c.id===selected);$(key==='radius'?'property-radius':'cell-'+key).value=Number((key==='radius'?doc.settings.radius:cell[key]).toFixed(2));if(key==='radius')$('setting-radius').value=doc.settings.radius;if($('selected-upper-width')){const upper=C.slide(doc.settings,cell);$('selected-upper-width').textContent=num(upper.width);$('selected-upper-depth').textContent=num(upper.depth);}draw();
    }catch(e){lastError=e.message;const cell=doc.cells.find(c=>c.id===selected);slider.value=key==='radius'?doc.settings.radius:cell[key];}};
    slider.addEventListener('input',apply);numeric.addEventListener('input',e=>{slider.value=numeric.value;apply(e);});numeric.addEventListener('change',e=>{if(snapshot){e.stopImmediatePropagation();finish(false);}},true);
    slider.addEventListener('change',()=>finish(false));slider.addEventListener('pointercancel',()=>finish(true));slider.addEventListener('blur',()=>finish(false));
  });
}
function point(e){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform($('canvas').getScreenCTM().inverse());return {x:p.x,y:-p.y};}
$('canvas').addEventListener('pointerdown',e=>{if(e.button!==0||drag||pan)return;if(mainView==='3d'){const group=e.target.closest('[data-index]');selected=group?doc.cells[Number(group.dataset.index)].id:null;selectedLayer=doc.layers===2&&e.target.closest('[data-layer]')?.dataset.layer==='上层'?'上层':'下层';showInspector('cell');render();return;}if(tool==='pan'){pan={startX:e.clientX,startY:e.clientY,origin:{...center},scale:$('canvas').getScreenCTM(),pointer:e.pointerId};$('canvas').setPointerCapture(e.pointerId);$('canvas').classList.add('panning');e.preventDefault();return;}const group=e.target.closest('[data-index]');if(!group){selected=null;render();return;}const index=Number(group.dataset.index),c=doc.cells[index];selected=c.id;selectedLayer=doc.layers===2&&e.target.closest('[data-layer]')?.dataset.layer==='上层'?'上层':'下层';showInspector('cell');if(selectedLayer==='上层'){render();return;}const start=point(e);drag={index,start,original:{...c},snapshot:C.clone(doc),resize:e.target.dataset.handle==='resize',pointer:e.pointerId,axes:[false,false]};$('canvas').setPointerCapture(e.pointerId);$('canvas').focus();render();e.preventDefault();});
$('canvas').addEventListener('pointermove',e=>{if(pan&&e.pointerId===pan.pointer){center={x:pan.origin.x-(e.clientX-pan.startX)/pan.scale.a,y:pan.origin.y-(e.clientY-pan.startY)/pan.scale.d};draw();return;}if(!drag||e.pointerId!==drag.pointer)return;const pt=point(e),d=drag,o=d.original;let candidate,axes=[false,false];if(d.resize){const min=Math.max(2*doc.settings.wall+.21,2*doc.settings.radius+.01,5),left=o.x-o.width/2,bottom=o.y-o.depth/2,w=Math.max(min,o.width+pt.x-d.start.x),dep=Math.max(min,o.depth+pt.y-d.start.y);candidate={...o,width:w,depth:dep,x:left+w/2,y:bottom+dep/2};if($('snap').checked&&!e.altKey){const result=C.resize(doc,candidate,d.index,left,bottom);candidate=result.cell;axes=result.axes;}}else{candidate={...o,x:o.x+pt.x-d.start.x,y:o.y+pt.y-d.start.y};if($('snap').checked&&!e.altKey){const result=C.snap(doc,candidate,d.index);candidate=result.cell;axes=result.axes;}}for(const k of ['width','depth','x','y'])candidate[k]=C.round(candidate[k]);doc.cells[d.index]=candidate;d.axes=axes;draw();});
function endDrag(cancel=false){if(pan){pan=null;$('canvas').classList.remove('panning');return;}if(!drag)return;const d=drag;drag=null;const candidate=doc.cells[d.index];if(cancel||!C.fits(doc,candidate,d.index)){doc=d.snapshot;if(!cancel)toast('位置未采用：格子不能越界、重叠或超过打印空间');}else if(JSON.stringify(candidate)!==JSON.stringify(d.original)){undo.push(d.snapshot);if(undo.length>50)undo.shift();redo=[];save();}render();}
$('canvas').addEventListener('pointerup',()=>endDrag());$('canvas').addEventListener('pointercancel',()=>endDrag(true));$('canvas').addEventListener('lostpointercapture',()=>endDrag(true));
$('canvas').addEventListener('wheel',e=>{if(mainView==='3d'||drag)return;e.preventDefault();zoom=Math.max(.6,Math.min(3,zoom*(e.deltaY<0?1.12:.89)));draw();},{passive:false});$('fit').onclick=()=>{zoom=1;center={x:0,y:0};preview.fit();draw();};
function history(back){if(drag)return;const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;to.push(C.clone(doc));doc=from.pop();if(!doc.cells.some(c=>c.id===selected))selected=doc.cells[0]?.id;save();render();}
$('undo').onclick=()=>history(true);$('redo').onclick=()=>history(false);
async function layoutPreviewPNG(data,highlight=null){
  await document.fonts.ready;
  const fontFamily=getComputedStyle(document.documentElement).fontFamily;
  const p=data.settings,pad=90,width=1800,scale=Math.min((width-pad*2)/p.width,1600/p.depth),boardHeight=p.depth*scale,legendRows=Math.ceil(data.cells.length/3),height=Math.ceil(boardHeight+190+legendRows*30),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='#f6f7f8';ctx.fillRect(0,0,width,height);ctx.fillStyle='#243443';ctx.font=`bold 28px ${fontFamily}`;ctx.fillText(data.name, pad,42);ctx.font=`18px ${fontFamily}`;ctx.fillText(`W ${p.width} × L ${p.depth} mm · ${data.layers===2?'双层':'单层'} · ${data.cells.length} 格`,pad,74);const ox=pad,oy=110,rect=c=>[ox+(c.x-c.width/2+p.width/2)*scale,oy+(-c.y-c.depth/2+p.depth/2)*scale,c.width*scale,c.depth*scale];ctx.fillStyle='#dce2e7';ctx.fillRect(ox,oy,p.width*scale,boardHeight);
  data.cells.forEach((c,i)=>{const [x,y,w,h]=rect(c);ctx.fillStyle=c.id===highlight?'#f2d575':'#d4dfe5';ctx.strokeStyle='#536878';ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(x,y,w,h,Math.min(p.radius*scale,w/2,h/2));ctx.fill();ctx.stroke();if(data.layers===2){const u=C.slide(p,c),[ux,uy,uw,uh]=rect(u);ctx.save();ctx.setLineDash([7,5]);ctx.strokeStyle='#8b6b21';ctx.strokeRect(ux,uy,uw,uh);ctx.restore();}ctx.save();ctx.beginPath();ctx.rect(x+3,y+3,Math.max(0,w-6),Math.max(0,h-6));ctx.clip();ctx.fillStyle='#263847';ctx.textAlign='center';ctx.font=`bold 20px ${fontFamily}`;ctx.fillText(String(i+1).padStart(2,'0'),x+w/2,y+h/2);if(w>110&&h>65){ctx.font=`15px ${fontFamily}`;ctx.fillText(`${num(c.width)} × ${num(c.depth)}`,x+w/2,y+h/2+23);}ctx.restore();});
  ctx.fillStyle='#243443';ctx.textAlign='left';ctx.font=`17px ${fontFamily}`;data.cells.forEach((c,i)=>{const upper=data.layers===2?` / 上层H ${num(C.slide(p,c).height)}`:'';ctx.fillText(`${String(i+1).padStart(2,'0')}  ${num(c.width)} × ${num(c.depth)} × ${num(c.height)} mm${upper}`,pad+(i%3)*540,oy+boardHeight+44+Math.floor(i/3)*30);});
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('二维预览生成失败')),'image/png'));return new Uint8Array(await blob.arrayBuffer());
}
async function layoutCoverPNG(data){
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-10000px;top:0;width:768px;height:576px;pointer-events:none';document.body.append(canvas);
  const renderer=new DrawerPreview(canvas);
  try{
    renderer.doc=data;renderer.draw();
    const ctx=canvas.getContext('2d');ctx.save();ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#414345';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.restore();
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('三维封面生成失败')),'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }finally{renderer.doc=null;renderer.gl?.getExtension('WEBGL_lose_context')?.loseContext();canvas.remove();}
}
function downloadPackage(files,name){const url=URL.createObjectURL(new Blob([DrawerSTL.zip(files)],{type:'application/zip'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportFile(){try{const v=C.validate(doc);if(!v.valid)throw new Error(v.errors[0]);const data=C.parseDocument(doc),safe=data.name.replace(/[\\/:*?"<>|]/g,'_')||'抽屉布局',png=await layoutPreviewPNG(data);downloadPackage([{name:safe+'.json',data:new TextEncoder().encode(JSON.stringify(data,null,2))},{name:'二维布局预览.png',data:png}],safe+'-布局.zip');toast('已导出布局文件及二维预览图');}catch(e){toast('导出失败：'+e.message);}}
$('export-stl').onclick=()=>{$('stl-selected').disabled=!doc.cells.some(c=>c.id===selected);$('stl-dialog').showModal();};
function setExportFormat(format){
 const is3mf=format==='3mf';
 $('stl-options').hidden=is3mf;document.querySelector('.plate-export').hidden=!is3mf;
 $('stl-selected').hidden=is3mf;$('stl-all').hidden=is3mf;$('export-plates').hidden=!is3mf;
 $('format-stl').setAttribute('aria-pressed',String(!is3mf));$('format-3mf').setAttribute('aria-pressed',String(is3mf));if(is3mf)schedulePlatePreview();
}
$('format-stl').onclick=()=>setExportFormat('stl');$('format-3mf').onclick=()=>setExportFormat('3mf');setExportFormat('stl');
$('stl-cancel').onclick=()=>$('stl-dialog').close();
async function exportModels(current){try{const snapshot=C.clone(doc),models=DrawerSTL.models(snapshot,current?selected:null),safe=snapshot.name.replace(/[\\/:*?"<>|]/g,'_')||'抽屉收纳盒',png=await layoutPreviewPNG(snapshot,current?selected:null);downloadPackage([...models,{name:'二维布局预览.png',data:png}],safe+(current?'-当前格子':'')+'-STL.zip');$('stl-dialog').close();toast('已导出 '+models.length+' 个 STL 模型及二维预览图');}catch(e){toast('导出失败：'+e.message);}}
$('stl-selected').onclick=()=>exportModels(true);$('stl-all').onclick=()=>exportModels(false);
async function readLayoutFile(file){if(!file.name.toLowerCase().endsWith('.zip'))return file.text();const bytes=new Uint8Array(await file.arrayBuffer()),v=new DataView(bytes.buffer);let o=0;while(o+30<=bytes.length&&v.getUint32(o,true)===0x04034b50){const method=v.getUint16(o+8,true),size=v.getUint32(o+18,true),n=v.getUint16(o+26,true),extra=v.getUint16(o+28,true),start=o+30+n+extra,name=new TextDecoder().decode(bytes.slice(o+30,o+30+n));if(start+size>bytes.length)throw new Error('压缩包不完整');if(name.endsWith('.json')){if(method!==0||size>1024*1024)throw new Error('请解压后选择JSON布局文件');return new TextDecoder().decode(bytes.slice(start,start+size));}o=start+size;}throw new Error('压缩包中没有布局JSON，请选择布局包或解压后的JSON');}
$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;try{if(file.size>(file.name.toLowerCase().endsWith('.zip')?32:1)*1024*1024)throw new Error('文件过大');const imported=C.parseDocument(await readLayoutFile(file)),v=C.validate(imported);if(!v.valid)throw new Error(v.errors[0]);commit(()=>{activeScheme=null;doc=imported;doc.settings.drawer_display='SOLID';doc.drawerConfigured=true;selected=doc.cells[0].id;zoom=1;center={x:0,y:0};});toast('已打开布局');}catch(e){toast('打开失败：'+e.message);}finally{$('file').value='';}};
document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||$('onboarding-dialog').open)return;if(e.key==='Escape'){endDrag(true);selected=null;preview.clearHover();render();return;}if(e.ctrlKey||e.metaKey){if(e.key.toLowerCase()==='z'){e.preventDefault();history(!e.shiftKey);}if(e.key.toLowerCase()==='y'){e.preventDefault();history(false);}if(e.key.toLowerCase()==='s'){e.preventDefault();$('export-stl').click();}}});
let onboardingStep=1,onboardingCandidate=null;

function onboardingPage(step){
 onboardingStep=step;$('onboarding-dialog').dataset.step=step;for(let i=1;i<=3;i++)$('onboarding-page-'+i).hidden=i!==step;
 document.querySelectorAll('[data-onboarding-step]').forEach(el=>{const active=Number(el.dataset.onboardingStep)===step;el.classList.toggle('current',active);if(active)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
 $('onboarding-back').hidden=step===1;$('onboarding-next').textContent=step===3?'开始编辑':'下一步';$('onboarding-error').textContent='';
}
$('onboarding-printer').innerHTML=DrawerPlates.printers.map(p=>`<option value="${p.id}">${p.size?p.name:'自定义尺寸'}</option>`).join('');
$('onboarding-printer').onchange=()=>{
 const printer=DrawerPlates.printers.find(p=>p.id===$('onboarding-printer').value);
 if(printer?.size)['width','depth','height'].forEach((axis,i)=>{$('onboarding-bed-'+axis).value=printer.size[i];});
 $('onboarding-error').textContent='';
};
['width','depth','height'].forEach(axis=>$('onboarding-bed-'+axis).addEventListener('input',()=>{$('onboarding-printer').value='current';}));
function openOnboarding(){
 endDrag(true);onboardingCandidate=null;$('onboarding-printer').value='current';
 const initial=!doc.drawerConfigured,p=initial?doc.settings:C.defaults;
 $('onboarding-name').value=initial?(doc.name||'我的抽屉'):'新抽屉';
 $('onboarding-width').value=p.width;$('onboarding-depth').value=p.depth;$('onboarding-height').value=p.drawer_height;
 $('onboarding-bed-width').value=doc.settings.bed_x;$('onboarding-bed-depth').value=doc.settings.bed_y;$('onboarding-bed-height').value=doc.settings.bed_z;
 $('onboarding-layers').value='1';$('onboarding-pattern').value='GRID';$('onboarding-cols').value='3';$('onboarding-rows').value='2';$('onboarding-count').value='6';$('onboarding-min-size').value='40';$('onboarding-seed').value='8';
 $('onboarding-grid').hidden=false;$('onboarding-random').hidden=true;$('onboarding-cancel').hidden=initial;
 onboardingPage(1);$('onboarding-dialog').showModal();$('onboarding-name').focus();
}
function onboardingNumber(id,min,max,integer=false){const input=$(id),value=input.valueAsNumber;if(!Number.isFinite(value)||value<min||value>max||integer&&!Number.isInteger(value))throw new Error(input.closest('label').firstChild.textContent.trim()+'应为 '+min+'–'+max+(integer?' 的整数':' 之间的数值'));return value;}
function onboardingDimensions(){return {width:onboardingNumber('onboarding-width',1,3000),depth:onboardingNumber('onboarding-depth',1,3000),drawer_height:onboardingNumber('onboarding-height',1,1000)};}
function onboardingPrinter(){return {bed_x:onboardingNumber('onboarding-bed-width',1,3000),bed_y:onboardingNumber('onboarding-bed-depth',1,3000),bed_z:onboardingNumber('onboarding-bed-height',1,3000)};}
function createOnboardingPreview(){
 const base=C.createDefault();base.drawerConfigured=true;base.name=$('onboarding-name').value.trim()||'我的抽屉';Object.assign(base.settings,onboardingDimensions(),onboardingPrinter());
 const random=$('onboarding-pattern').value==='RANDOM',double=$('onboarding-layers').value==='2',options={mode:(double?'DOUBLE_':'')+(random?'RANDOM':'GRID')};
 if(random){options.count=onboardingNumber('onboarding-count',1,100,true);options.minSize=onboardingNumber('onboarding-min-size',4,1000);options.seed=onboardingNumber('onboarding-seed',0,2147483647,true);}else{options.columns=onboardingNumber('onboarding-cols',1,20,true);options.rows=onboardingNumber('onboarding-rows',1,20,true);}
 onboardingCandidate=C.createLayout(base,options);
}
function applyOnboarding(){
 if(!onboardingCandidate)throw new Error('请先设置布局');
 const next=C.clone(onboardingCandidate),library=C.clone(schemes),current=library.find(s=>s.id===activeScheme);
 if(current){current.doc=C.clone(doc);current.name=doc.name;current.updated=Date.now();}
 else if(doc.drawerConfigured&&C.validate(doc).valid)library.push({id:schemeId(),name:doc.name,doc:C.clone(doc),updated:Date.now()});
 if(library.length>=100)throw new Error('常用方案已满，请先删除不需要的方案后再新建');
 const id=schemeId();library.push({id,name:next.name,doc:C.clone(next),updated:Date.now()});
 const previousLibrary=localStorage.getItem(schemesKey),previousDraft=localStorage.getItem(key);
 try{localStorage.setItem(schemesKey,JSON.stringify({version:1,active:id,items:library,removed:removedScheme}));localStorage.setItem(key,JSON.stringify(next));}catch(error){try{if(previousLibrary===null)localStorage.removeItem(schemesKey);else localStorage.setItem(schemesKey,previousLibrary);if(previousDraft===null)localStorage.removeItem(key);else localStorage.setItem(key,previousDraft);}catch{}throw new Error('本机保存失败，请清理存储空间后重试');}
 doc=next;schemes=library;activeScheme=id;hasStoredDraft=true;selected=doc.cells[0]?.id;selectedLayer='下层';undo=[];redo=[];zoom=1;center={x:0,y:0};mainView='3d';placeViews();preview.clearHover();preview.reset();setTool('select');showInspector('cell');render();$('onboarding-dialog').close();toast('新方案已创建，可以开始编辑');
}
$('new-scheme').onclick=openOnboarding;
$('onboarding-pattern').onchange=()=>{const random=$('onboarding-pattern').value==='RANDOM';$('onboarding-grid').hidden=random;$('onboarding-random').hidden=!random;};
$('onboarding-back').onclick=()=>onboardingPage(onboardingStep-1);
$('onboarding-cancel').onclick=()=>$('onboarding-dialog').close();
$('onboarding-next').onclick=()=>{try{if(onboardingStep===1){onboardingDimensions();onboardingPage(2);}else if(onboardingStep===2){onboardingPrinter();onboardingPage(3);}else if(onboardingStep===3){createOnboardingPreview();applyOnboarding();}}catch(e){$('onboarding-error').textContent=e.message;}};
$('onboarding-dialog').addEventListener('cancel',e=>{if(!doc.drawerConfigured)e.preventDefault();});
$('onboarding-dialog').addEventListener('close',()=>{onboardingCandidate=null;});

function showDrawerSetup(){
  endDrag(true);
  $('setup-width').value=doc.settings.width;$('setup-depth').value=doc.settings.depth;$('setup-height').value=doc.settings.drawer_height;
  $('setup-grid').hidden=hasStoredDraft||doc.drawerConfigured;
  $('drawer-dialog-title').textContent=doc.drawerConfigured?'修改抽屉净尺寸':'先设置抽屉净尺寸';
  $('apply-drawer').textContent=doc.drawerConfigured?'应用并自动贴合':'开始布局';
  $('cancel-drawer').hidden=!doc.drawerConfigured&&!hasStoredDraft;$('setup-error').textContent='';enhanceNumberControls();$('drawer-dialog').showModal();
}
$('cancel-drawer').onclick=()=>$('drawer-dialog').close();
$('drawer-dialog').addEventListener('cancel',e=>{if(!doc.drawerConfigured&&!hasStoredDraft)e.preventDefault();});
$('drawer-form').addEventListener('submit',e=>{
  e.preventDefault();
  try{
    const changes={width:$('setup-width').valueAsNumber,depth:$('setup-depth').valueAsNumber,drawer_height:$('setup-height').valueAsNumber};
    const fitted=C.resizeDrawer(doc,changes,{columns:$('setup-cols').valueAsNumber,rows:$('setup-rows').valueAsNumber});
    const apply=()=>{doc=fitted;hasStoredDraft=true;selected=doc.cells.some(c=>c.id===selected)?selected:doc.cells[0]?.id;zoom=1;center={x:0,y:0};preview.fit();};
    if(doc.drawerConfigured)commit(apply);else{apply();undo=[];redo=[];save();render();}
    $('drawer-dialog').close();toast('净尺寸已设置，收纳盒已自动贴合');
  }catch(error){$('setup-error').textContent=error.message;}
});
window.addEventListener('resize',draw);if(hasStoredDraft&&doc.layout.mode.endsWith('RANDOM')&&C.validate(doc,{ignorePrint:true}).valid&&!C.validate(doc).valid){try{const repaired=C.createLayout(doc,doc.layout);remember();doc=repaired;save();toast('旧随机布局已按打印空间重新生成，可撤销');}catch(e){toast(e.message);}}restoreUI();uiReady=true;render();enhanceNumberControls();if(!doc.drawerConfigured)openOnboarding();

let platePlan=null,platePlanKey='',platePreviewTimer=null,plateExporting=false;
let platePreferences={software:'bambu',printer:'current'};
try{Object.assign(platePreferences,JSON.parse(localStorage.getItem('drawer-plate-export')||'{}'));}catch(e){}
if(!DrawerPlates.software[platePreferences.software])platePreferences.software='bambu';
$('plate-software').value=platePreferences.software;
function updatePlateSize(){
 const printer=DrawerPlates.printers.find(p=>p.id===$('plate-printer').value),size=printer?.size||[doc.settings.bed_x,doc.settings.bed_y,doc.settings.bed_z];
 $('plate-size').textContent='打印空间 W '+size[0]+' × L '+size[1]+' × H '+size[2]+' mm'+(printer?.excluded?' · 已避开前左角禁用区域':'');
 platePreferences={software:$('plate-software').value,printer:$('plate-printer').value};try{localStorage.setItem('drawer-plate-export',JSON.stringify(platePreferences));}catch(e){}
 $('plate-status').textContent='';schedulePlatePreview();
}
function updatePlatePrinters(){
 const target=$('plate-software').value;
 $('plate-printer').innerHTML=DrawerPlates.printers.filter(p=>!p.family||target==='orca'||p.family===target).map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
 if([...$('plate-printer').options].some(o=>o.value===platePreferences.printer))$('plate-printer').value=platePreferences.printer;
 updatePlateSize();
}
$('plate-software').onchange=updatePlatePrinters;$('plate-printer').onchange=updatePlateSize;updatePlatePrinters();
$('export-stl').addEventListener('click',updatePlateSize);
function currentPlateKey(){return JSON.stringify([doc,$('plate-software').value,$('plate-printer').value,$('plate-gap').value]);}
function schedulePlatePreview(){
 clearTimeout(platePreviewTimer);platePlan=null;platePlanKey='';$('export-plates').disabled=true;$('plate-thumbnails').innerHTML='';
 if(document.querySelector('.plate-export').hidden){$('plate-summary').textContent='';return;}
 $('plate-summary').textContent='正在计算摆盘…';$('plate-status').textContent='';
 platePreviewTimer=setTimeout(()=>{
  try{
   const snapshot=C.clone(doc),gap=Number($('plate-gap').value);if(!$('plate-gap').value.trim())throw new Error('请输入模型间距');
   const plan=DrawerPlates.prepare(snapshot,gap,$('plate-software').value,$('plate-printer').value),p=plan.snapshot.settings;
   platePlan={plan,doc:snapshot,gap,target:$('plate-software').value,printer:$('plate-printer').value};platePlanKey=currentPlateKey();
   $('plate-summary').textContent=`共 ${plan.plates.length} 盘 · ${plan.plates.reduce((n,p)=>n+p.items.length,0)} 个盒子`;
   $('plate-thumbnails').innerHTML=plan.plates.map((plate,index)=>`<figure class="plate-thumb"><svg viewBox="-3 -3 ${p.bed_x+6} ${p.bed_y+6}" role="img" aria-label="第 ${index+1} 盘，${plate.items.length} 个盒子"><rect width="${p.bed_x}" height="${p.bed_y}" fill="#292e2b" stroke="#7a857d" stroke-width="1"/>${(plan.printer.excluded||[]).map(e=>`<rect x="${e.x}" y="${p.bed_y-e.y-e.d}" width="${e.w}" height="${e.d}" fill="#8c5048"/>`).join('')}${plate.items.map(item=>`<g><title>${esc(item.name)}</title><rect x="${item.x}" y="${p.bed_y-item.y-item.d}" width="${item.w}" height="${item.d}" rx="2" fill="#83988a" stroke="#d0dacf" stroke-width=".7"/><text x="${item.x+item.w/2}" y="${p.bed_y-item.y-item.d/2}" text-anchor="middle" dominant-baseline="middle" fill="#16271c" font-size="10">${esc(item.name.slice(0,2))}${item.name.includes('上层')?'上':item.name.includes('下层')?'下':''}</text></g>`).join('')}</svg><figcaption>第 ${index+1} 盘 <span>${plate.items.length} 个盒子</span></figcaption></figure>`).join('');
   $('export-plates').disabled=plateExporting;
  }catch(e){platePlan=null;$('plate-summary').textContent='无法摆盘：'+e.message;}
 },150);
}
$('plate-gap').addEventListener('input',schedulePlatePreview);
$('plate-gap').addEventListener('change',schedulePlatePreview);
$('export-plates').onclick=async()=>{
 if(!platePlan||platePlanKey!==currentPlateKey()){schedulePlatePreview();return;}
 const button=$('export-plates'),cached=platePlan;plateExporting=true;button.disabled=true;$('plate-status').textContent='正在生成多盘工程…';
 try{
  await new Promise(resolve=>setTimeout(resolve,20));const snapshot=cached.doc;
  const png=await layoutPreviewPNG(snapshot),cover=await layoutCoverPNG(snapshot),result=DrawerPlates.project(snapshot,cached.gap,cached.target,cached.printer,png,cover,cached.plan),safe=snapshot.name.replace(/[\\/:*?"<>|]/g,'_')||'抽屉收纳盒';
  const url=URL.createObjectURL(new Blob([result.data],{type:'model/3mf'})),a=document.createElement('a');a.href=url;a.download=safe+'-多盘.3mf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('plate-status').textContent='已导出 1 个 3MF · '+result.count+' 盘 · '+result.objects+' 个盒子';toast('已导出多盘 3MF 工程');
 }catch(e){$('plate-status').textContent='导出失败：'+e.message;}finally{plateExporting=false;button.disabled=!platePlan||platePlanKey!==currentPlateKey();}
};
})();
