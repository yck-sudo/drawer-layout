(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DrawerLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EPS = 0.001;
  const ranges = {width:[1,3000],depth:[1,3000],drawer_height:[1,1000],height:[1,1000],upper_height:[0,1000],wall:[.2,20],base:[.2,20],radius:[0,100],segments:[2,32],margin:[0,100],gap:[0,50],bed_x:[1,3000],bed_y:[1,3000],bed_z:[1,3000],drawer_wall:[.2,100],drawer_base:[.2,100],drawer_radius:[0,1500],chamfer_size:[0,10],upper_depth_ratio:[.35,.8],slide_clearance:[.05,.8],slide_position:[0,1]};
  const defaults = {width:360,depth:280,drawer_height:80,height:60,upper_height:0,wall:1.6,base:1.6,radius:4,segments:8,margin:1,gap:.6,bed_x:256,bed_y:256,bed_z:256,drawer_wall:12,drawer_base:6,drawer_radius:0,drawer_visible:true,drawer_display:'SOLID',chamfer_enabled:false,chamfer_size:.3,upper_depth_ratio:.6,slide_clearance:.15,slide_position:.5};
  const layoutDefaults={mode:'GRID',columns:3,rows:2,count:6,minSize:40,seed:8,columnRatios:'',rowRatios:''};
  const clone = x => JSON.parse(JSON.stringify(x));
  const round = x => Math.round(x*1e6)/1e6 || 0;
  function createDefault() {
    return {schema:'drawer-organizer-layout',version:1,units:'mm',coordinates:'center_xy_y_up',name:'我的抽屉',drawerConfigured:false,layout:{...layoutDefaults},layers:1,settings:{...defaults},cells:[
      {id:'box-1',name:'长物收纳',width:140,depth:120,height:60,x:-100,y:65},
      {id:'box-2',name:'常用物品',width:180,depth:120,height:60,x:65,y:65},
      {id:'box-3',name:'小物 01',width:105,depth:110,height:60,x:-117.5,y:-55},
      {id:'box-4',name:'小物 02',width:105,depth:110,height:60,x:-7.5,y:-55},
      {id:'box-5',name:'小物 03',width:105,depth:110,height:60,x:102.5,y:-55}]};
  }
  function margin(p) {const r=Math.max(0,p.drawer_radius-p.drawer_wall);return Math.max(p.margin,r*(1-1/Math.sqrt(2))+(r?.001:0));}
  function upperHeight(p,c){const h=c?.upper_height??p.upper_height;return h>0?h:p.height;}
  function heightLimit(doc,c) {const p=doc.settings;return doc.layers===2?Math.min(c?p.drawer_height-upperHeight(p,c):p.upper_height>0?p.drawer_height-p.upper_height:p.drawer_height/2,p.bed_z-1.2):Math.min(p.drawer_height,p.bed_z);}
  function chamferLimit(doc) {const p=doc.settings;return Math.max(0,Math.min(p.wall*(doc.layers===2?.125:.4),(Math.min(p.height,doc.layers===2?upperHeight(p):p.height)-p.base)/2,doc.layers===2?.6:10));}
  function orientation(w,d,h,p) {if(h>p.bed_z+EPS)return null;if(w<=p.bed_x+EPS&&d<=p.bed_y+EPS)return 0;if(w<=p.bed_y+EPS&&d<=p.bed_x+EPS)return 90;return null;}
  function slide(p,c) {p={...p,...Object.fromEntries(['upper_depth_ratio','slide_clearance','slide_position','upper_height'].filter(k=>c[k]!==undefined).map(k=>[k,c[k]]))};const width=c.width-p.wall-2*p.slide_clearance,usable=c.depth-2*Math.max(p.radius,p.wall)-2*p.slide_clearance,depth=usable*p.upper_depth_ratio;let radius=Math.min(p.radius,width/2-.01,depth/2-.01);if(radius<=p.wall)radius=0;return {width,depth,radius,height:upperHeight(p),travel:usable-depth,x:c.x,y:c.y+(p.slide_position-.5)*(usable-depth)};}
  function overlap(a,b,p) {return Math.abs(a.x-b.x)+EPS<(a.width+b.width)/2+p.gap&&Math.abs(a.y-b.y)+EPS<(a.depth+b.depth)/2+p.gap;}
  function cellErrors(doc,c,{ignorePrint=false}={}) {
    const p=doc.settings,errors=[];for(const k of ['upper_depth_ratio','slide_clearance','slide_position','upper_height'])if(c[k]!==undefined&&(!Number.isFinite(c[k])||c[k]<ranges[k][0]||c[k]>ranges[k][1]))errors.push('单格上层参数超出允许范围');
    if(['width','depth','height','x','y'].some(k=>!Number.isFinite(c[k])))return ['尺寸或位置不是有效数值'];
    if(Math.min(c.width,c.depth)<=2*p.wall+.2)errors.push('尺寸过小，内腔须大于 0.2 mm');
    if(p.radius&&(p.radius<=p.wall||2*p.radius>=Math.min(c.width,c.depth)))errors.push('圆角须大于壁厚且小于最短外边的一半');
    if(c.height<=p.base||c.height>heightLimit(doc,c)+EPS)errors.push('盒高超出抽屉或打印空间，或不大于底厚');
    if(Math.abs(c.x)+c.width/2>p.width/2-margin(p)+EPS||Math.abs(c.y)+c.depth/2>p.depth/2-margin(p)+EPS)errors.push('格子超出抽屉可用边界');
    if(!ignorePrint&&orientation(c.width,c.depth,c.height+(doc.layers===2?1.2:0),p)===null)errors.push('格子超过打印空间（含旋转 90°）');
    if(p.chamfer_enabled&&(p.chamfer_size>chamferLimit(doc)+EPS||p.chamfer_size>(c.height-p.base)/2+EPS))errors.push('倒角超过当前结构允许的宽度');
    if(doc.layers===2){
      const upper=slide(p,c);if(p.chamfer_enabled&&p.chamfer_size>(upper.height-p.base)/2+EPS)errors.push('上层高度不足以容纳当前倒角');
      
      if(upperHeight(p,c)<=p.base||c.height+upperHeight(p,c)>p.drawer_height+EPS)errors.push('上下层总高度超过抽屉净高，或上层高度不足');
      if(c.height<7||(c.slide_clearance??p.slide_clearance)>=p.wall/2||upper.depth<=2*p.wall+2||upper.width<=Math.max(2*p.wall+2,4))errors.push('双层承托空间不足，请增大格子或调整壁厚');
      if(!ignorePrint&&orientation(upper.width,upper.depth,upper.height,p)===null)errors.push('上层超过打印空间');
    }
    return errors;
  }
  function validate(doc,{ignorePrint=false}={}) {
    const errors=[],byCell={};const p=doc.settings;
    for(const [k,[lo,hi]] of Object.entries(ranges))if(!Number.isFinite(p[k])||p[k]<lo||p[k]>hi||(k==='segments'&&!Number.isInteger(p[k])))errors.push('参数 '+k+' 超出允许范围');
    if(p.height<=p.base||p.height>heightLimit(doc)+EPS)errors.push('默认盒高须大于底厚，且不超过可用高度');
    if(!doc.cells.length)errors.push('请添加至少一个格子');if(doc.cells.length>100)errors.push('最多支持 100 个格子');
    doc.cells.forEach((c,i)=>{const e=cellErrors(doc,c,{ignorePrint});if(e.length)byCell[i]=e;});
    for(let i=0;i<doc.cells.length;i++)for(let j=i+1;j<doc.cells.length;j++)if(overlap(doc.cells[i],doc.cells[j],p)){
      (byCell[i]??=[]).push('与格子 '+String(j+1).padStart(2,'0')+' 重叠或间隙不足');(byCell[j]??=[]).push('与格子 '+String(i+1).padStart(2,'0')+' 重叠或间隙不足');
    }
    for(const [i,e] of Object.entries(byCell))errors.push('格子 '+String(+i+1).padStart(2,'0')+'：'+e[0]);
    return {errors,byCell,valid:errors.length===0};
  }
  function fits(doc,c,index) {return cellErrors(doc,c).length===0&&!doc.cells.some((b,i)=>i!==index&&overlap(c,b,doc.settings));}
  function snap(doc,c,index,threshold=6) {
    const p=doc.settings,m=margin(p),others=doc.cells.filter((_,i)=>i!==index),xs=[-p.width/2+m+c.width/2,p.width/2-m-c.width/2],ys=[-p.depth/2+m+c.depth/2,p.depth/2-m-c.depth/2];
    for(const b of others){xs.push(b.x-(b.width+c.width)/2-p.gap,b.x+(b.width+c.width)/2+p.gap,b.x+(c.width-b.width)/2,b.x+(b.width-c.width)/2,b.x);ys.push(b.y-(b.depth+c.depth)/2-p.gap,b.y+(b.depth+c.depth)/2+p.gap,b.y+(c.depth-b.depth)/2,b.y+(b.depth-c.depth)/2,b.y);}
    const xx=[...new Set(xs)].filter(v=>Math.abs(v-c.x)<=threshold).map(v=>[v,true]);xx.push([c.x,false]);
    const yy=[...new Set(ys)].filter(v=>Math.abs(v-c.y)<=threshold).map(v=>[v,true]);yy.push([c.y,false]);
    const candidates=[];for(const [x,sx]of xx)for(const[y,sy]of yy)candidates.push({x,y,sx,sy});
    candidates.sort((a,b)=>(+!a.sx+ +!a.sy)-(+!b.sx+ +!b.sy)||(a.x-c.x)**2+(a.y-c.y)**2-(b.x-c.x)**2-(b.y-c.y)**2);
    for(const v of candidates){const trial={...c,x:round(v.x),y:round(v.y)};if(fits(doc,trial,index))return {cell:trial,axes:[v.sx,v.sy]};}
    return {cell:c,axes:[false,false]};
  }
  function resize(doc,c,index,left,bottom,threshold=6) {
    const p=doc.settings,others=doc.cells.filter((_,i)=>i!==index),right=left+c.width,top=bottom+c.depth;
    const tx=[p.width/2-margin(p)],ty=[p.depth/2-margin(p)];
    for(const b of others){tx.push(b.x-b.width/2-p.gap,b.x+b.width/2);ty.push(b.y-b.depth/2-p.gap,b.y+b.depth/2);}
    const xx=[...new Set(tx)].filter(v=>v>left+.5&&Math.abs(v-right)<=threshold).map(v=>[v,true]);xx.push([right,false]);
    const yy=[...new Set(ty)].filter(v=>v>bottom+.5&&Math.abs(v-top)<=threshold).map(v=>[v,true]);yy.push([top,false]);
    const values=[];for(const[x,sx]of xx)for(const[y,sy]of yy)values.push({x,y,sx,sy});
    values.sort((a,b)=>(+!a.sx+ +!a.sy)-(+!b.sx+ +!b.sy)||(a.x-right)**2+(a.y-top)**2-(b.x-right)**2-(b.y-top)**2);
    for(const v of values){const trial={...c,width:round(v.x-left),depth:round(v.y-bottom),x:round((left+v.x)/2),y:round((bottom+v.y)/2)};if(fits(doc,trial,index))return {cell:trial,axes:[v.sx,v.sy]};}
    return {cell:c,axes:[false,false]};
  }
  function add(doc,size={width:60,depth:60}) {
    if(doc.cells.length>=100)return null;const p=doc.settings,m=margin(p),width=Math.min(size.width,p.width-2*m,p.bed_x,p.bed_y),depth=Math.min(size.depth,p.depth-2*m,p.bed_x,p.bed_y);
    const xs=[-p.width/2+m+width/2,p.width/2-m-width/2,0],ys=[-p.depth/2+m+depth/2,p.depth/2-m-depth/2,0];
    doc.cells.forEach(b=>{xs.push(b.x-(b.width+width)/2-p.gap,b.x+(b.width+width)/2+p.gap);ys.push(b.y-(b.depth+depth)/2-p.gap,b.y+(b.depth+depth)/2+p.gap);});
    for(let i=0;i<=20;i++){xs.push(-p.width/2+m+width/2+i*(p.width-2*m-width)/20);ys.push(-p.depth/2+m+depth/2+i*(p.depth-2*m-depth)/20);}
    for(const y of [...new Set(ys)].sort((a,b)=>a-b))for(const x of [...new Set(xs)].sort((a,b)=>a-b)){const c={id:'box-'+Date.now()+'-'+doc.cells.length,name:'新格子',width,depth,height:p.height,x:round(x),y:round(y)};if(fits(doc,c,-1))return c;}
    return size.width>20 ? add(doc,{width:Math.max(20,size.width-20),depth:Math.max(20,size.depth-20)}) : null;
  }
  function grid(doc,columns,rows,{ignorePrint=false}={}) {
    if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns*rows>100)throw new Error('行列数量须大于零，格子总数不超过 100');
    const p=doc.settings,m=margin(p),w=(p.width-2*m-(columns-1)*p.gap)/columns,d=(p.depth-2*m-(rows-1)*p.gap)/rows,cells=[];
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++)cells.push({id:'grid-'+row+'-'+col,name:'格子 '+String(cells.length+1).padStart(2,'0'),width:round(w),depth:round(d),height:p.height,x:round(-p.width/2+m+w/2+col*(w+p.gap)),y:round(p.depth/2-m-d/2-row*(d+p.gap))});
    const test=validate({...doc,cells},{ignorePrint});if(!test.valid)throw new Error(test.errors[0]);return cells;
  }
  function layoutOptions(input={}) {
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('布局设置无效');
    const o={...layoutDefaults,...input};
    if(!['GRID','RANDOM','DOUBLE_GRID','DOUBLE_RANDOM','CUSTOM'].includes(o.mode))throw new Error('布局方式无效');
    for(const key of ['columns','rows','count','seed'])if(!Number.isInteger(o[key])||o[key]<(key==='seed'?0:1)||o[key]>(key==='seed'?2147483647:key==='count'?100:20))throw new Error('布局数量或随机种子无效');
    if(!Number.isFinite(o.minSize)||o.minSize<4||o.minSize>1000)throw new Error('最小格尺寸须为 4 至 1000 mm');
    for(const key of ['columnRatios','rowRatios'])if(typeof o[key]!=='string'||o[key].length>300)throw new Error('行列比例无效');
    return o;
  }
  function weightedGrid(doc,o){
    const weights=(text,count)=>{if(!text.trim())return Array(count).fill(1);const values=text.trim().split(/[，,：:\s]+/).map(Number);if(values.length!==count||values.some(v=>!Number.isFinite(v)||v<=0))throw new Error('比例数量须对应行列数，且每项大于零');return values;};
    if(o.columns*o.rows>100)throw new Error('最多支持 100 个格子');
    const p=doc.settings,m=margin(p),wx=weights(o.columnRatios,o.columns),wy=weights(o.rowRatios,o.rows),totalX=wx.reduce((a,b)=>a+b),totalY=wy.reduce((a,b)=>a+b),width=p.width-2*m-(o.columns-1)*p.gap,depth=p.depth-2*m-(o.rows-1)*p.gap,cells=[];
    let top=p.depth/2-m;for(let row=0;row<o.rows;row++){const d=depth*wy[row]/totalY;let left=-p.width/2+m;for(let col=0;col<o.columns;col++){const w=width*wx[col]/totalX;cells.push({id:'grid-'+row+'-'+col,name:'格子 '+String(cells.length+1).padStart(2,'0'),width:round(w),depth:round(d),height:p.height,x:round(left+w/2),y:round(top-d/2)});left+=w+p.gap;}top-=d+p.gap;}return cells;
  }
  function randomLayout(doc,o){
    const p=doc.settings,m=margin(p),minimum=Math.max(o.minSize,2*p.wall+.201,p.radius?2*p.radius+.001:0,doc.layers===2?Math.max(3*p.wall+2+2*p.slide_clearance+.001,2*Math.max(p.radius,p.wall)+2*p.slide_clearance+(Math.max(2*p.wall+2,4)+.001)/p.upper_depth_ratio):0),gap=p.gap;
    let seed=o.seed>>>0;const random=()=>{seed=(seed+0x6D2B79F5)>>>0;let t=seed;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
    const capacity=(w,d)=>Math.max(0,Math.floor((w+gap+.000001)/(minimum+gap)))*Math.max(0,Math.floor((d+gap+.000001)/(minimum+gap)));
    const cells=[];
    function divide(x,y,w,d,n){
      if(n===1){if(orientation(w,d,p.height+(doc.layers===2?1.2:0),p)===null)throw new Error('单格超过打印空间');if(doc.layers===2){const upper=slide(p,{width:w,depth:d,x:0,y:0});if(orientation(upper.width,upper.depth,upper.height,p)===null)throw new Error('上层超过打印空间');}cells.push({id:'random-'+cells.length,name:'格子 '+String(cells.length+1).padStart(2,'0'),width:round(w),depth:round(d),height:p.height,x:round(x+w/2),y:round(y+d/2)});return;}
      const nx=Math.floor((w+gap+.000001)/(minimum+gap)),ny=Math.floor((d+gap+.000001)/(minimum+gap)),axis=nx<2?'y':ny<2?'x':random()<w/(w+d)?'x':'y',units=axis==='x'?nx:ny,length=axis==='x'?w:d,k=1+Math.floor(random()*(units-1));
      const low=k*(minimum+gap)-gap,high=length-(units-k)*(minimum+gap),cut=low+(high-low)*random();
      const ca=axis==='x'?capacity(cut,d):capacity(w,cut),cb=axis==='x'?capacity(w-cut-gap,d):capacity(w,d-cut-gap),lo=Math.max(1,n-cb),hi=Math.min(n-1,ca);
      if(lo>hi)throw new Error('当前尺寸无法容纳随机分格');const na=lo+Math.floor(random()*(hi-lo+1));
      if(axis==='x'){divide(x,y,cut,d,na);divide(x+cut+gap,y,w-cut-gap,d,n-na);}else{divide(x,y,w,cut,na);divide(x,y+cut+gap,w,d-cut-gap,n-na);}
    }
    const w=p.width-2*m,d=p.depth-2*m;if(capacity(w,d)<o.count)throw new Error('抽屉空间不足，请减少格数或最小格尺寸');
    if(orientation(minimum,minimum,p.height+(doc.layers===2?1.2:0),p)===null)throw new Error('最小格尺寸或盒高超过打印空间，请减小参数');
    for(let attempt=0;attempt<64;attempt++){cells.length=0;try{divide(-w/2,-d/2,w,d,o.count);return cells;}catch{}}
    // When arbitrary cuts cannot find a printable arrangement, use random
    // row bands with bounded widths/depths. This also covers near-bed-sized
    // drawers where unconstrained random cuts have a tiny success interval.
    const choices=[];
    for(const [maxW,maxD]of [[p.bed_x,p.bed_y],[p.bed_y,p.bed_x]]){
      const minCols=Math.ceil((w+gap)/(maxW+gap)-1e-9),maxCols=Math.floor((w+gap)/(minimum+gap)+1e-9),minRows=Math.ceil((d+gap)/(maxD+gap)-1e-9),maxRows=Math.min(o.count,Math.floor((d+gap)/(minimum+gap)+1e-9));
      for(let rows=minRows;rows<=maxRows;rows++)if(rows*minCols<=o.count&&rows*maxCols>=o.count)choices.push({maxW,maxD,minCols,maxCols,rows});
    }
    if(choices.length){
      const choice=choices[Math.floor(random()*choices.length)],counts=Array(choice.rows).fill(choice.minCols);let remaining=o.count-choice.rows*choice.minCols;
      while(remaining){const indices=counts.map((n,i)=>n<choice.maxCols?i:-1).filter(i=>i>=0);counts[indices[Math.floor(random()*indices.length)]]++;remaining--;}
      const sizes=(length,n,max)=>{const values=[];let rest=length-(n-1)*gap;for(let i=0;i<n;i++){const left=n-i-1,lo=Math.max(minimum,rest-left*max),hi=Math.min(max,rest-left*minimum),value=left?lo+(hi-lo)*random():rest;values.push(value);rest-=value;}return values;};
      const depths=sizes(d,choice.rows,choice.maxD);cells.length=0;let y=-d/2;
      for(let row=0;row<choice.rows;row++){const widths=sizes(w,counts[row],choice.maxW);let x=-w/2;for(const width of widths){cells.push({id:'random-'+cells.length,name:'格子 '+String(cells.length+1).padStart(2,'0'),width:round(width),depth:round(depths[row]),height:p.height,x:round(x+width/2),y:round(y+depths[row]/2)});x+=width+gap;}y+=depths[row]+gap;}return cells;
    }
    throw new Error('无法在当前格数和最小边长下生成适配打印空间的布局，请增加格数、减小最小边长或调整打印空间');
  }
  function createLayout(doc,input){
    const o=layoutOptions(input),next=clone(doc);next.layout=o;
    if(o.mode==='CUSTOM'){const result=validate(next);if(!result.valid)throw new Error(result.errors[0]);return next;}
    next.layers=o.mode.startsWith('DOUBLE_')?2:1;
    const p=next.settings;if(next.layers===2&&p.upper_height>0)p.upper_height=Math.min(p.upper_height,p.bed_z,p.drawer_height-7);p.height=Math.min(p.height,heightLimit(next));if(next.layers===2&&!p.upper_height)p.upper_height=p.height;if(p.chamfer_enabled)p.chamfer_size=Math.min(p.chamfer_size,chamferLimit(next));
    next.cells=o.mode.endsWith('RANDOM')?randomLayout(next,o):weightedGrid(next,o);
    const result=validate(next);if(!result.valid)throw new Error(result.errors[0]);return next;
  }
      function partitionLayout(cells) {
        if(cells.length===1){const c=cells[0];return {cell:c,w:c.width,d:c.depth,gx:0,gy:0};}
        const cuts=[];
        for(const [axis,size] of [['x','width'],['y','depth']]){
          const sorted=[...cells].sort((a,b)=>a[axis]-a[size]/2-(b[axis]-b[size]/2));
          const span=Math.max(...sorted.map(c=>c[axis]+c[size]/2))-(sorted[0][axis]-sorted[0][size]/2);
          let edge=-Infinity;
          for(let i=0;i<sorted.length-1;i++){
            edge=Math.max(edge,sorted[i][axis]+sorted[i][size]/2);
            const space=sorted[i+1][axis]-sorted[i+1][size]/2-edge;
            if(space>=-EPS)cuts.push({axis,sorted,index:i+1,score:space/span,balance:Math.abs(sorted.length-2*(i+1))});
          }
        }
        cuts.sort((a,b)=>b.score-a.score||a.balance-b.balance);
        if(!cuts.length)return {cells,w:Math.max(...cells.map(c=>c.x+c.width/2))-Math.min(...cells.map(c=>c.x-c.width/2)),d:Math.max(...cells.map(c=>c.y+c.depth/2))-Math.min(...cells.map(c=>c.y-c.depth/2)),gx:0,gy:0};
        const cut=cuts[0],a=partitionLayout(cut.sorted.slice(0,cut.index)),b=partitionLayout(cut.sorted.slice(cut.index)),horizontal=cut.axis==='x';
        return {axis:cut.axis,a,b,w:horizontal?a.w+b.w:Math.max(a.w,b.w),d:horizontal?Math.max(a.d,b.d):a.d+b.d,gx:horizontal?a.gx+b.gx+1:Math.max(a.gx,b.gx),gy:horizontal?Math.max(a.gy,b.gy):a.gy+b.gy+1};
      }
  function adaptCell(doc,id,key,value){
    if(!['width','depth'].includes(key)||!Number.isFinite(value)||value<=0)throw new Error('格子尺寸须为正数');
    const next=clone(doc),cell=next.cells.find(c=>c.id===id);if(!cell)throw new Error('未找到格子');
    const tree=partitionLayout(next.cells),axis=key==='width'?'x':'y',p=next.settings;
    // A stale single-layer default must not block valid individual boxes.
    if(next.layers===1&&heightLimit(next)>p.base+.2)p.height=round(Math.max(p.base+.2,Math.min(p.height,heightLimit(next))));
    const contains=node=>node.cell?node.cell.id===id:node.cells?node.cells.some(c=>c.id===id):contains(node.a)||contains(node.b);
    const hasCut=node=>{if(node.cell||node.cells)return false;return node.axis===axis||hasCut(contains(node.a)?node.a:node.b);};
    function place(node,x,y,w,d){
      if(node.cell){Object.assign(node.cell,{x:round(x+w/2),y:round(y+d/2),width:round(w),depth:round(d)});return;}
      if(node.cells)throw new Error('自由交错布局无法自动调整，请先重新贴合或生成布局');
      const horizontal=node.axis==='x',length=horizontal?w:d,gaps=horizontal?node.gx:node.gy,total=horizontal?node.w:node.d;
      let aLength=(length-p.gap*gaps)*(horizontal?node.a.w:node.a.d)/total+p.gap*(horizontal?node.a.gx:node.a.gy);
      if(node.axis===axis&&contains(node)){
        const inA=contains(node.a),branch=inA?node.a:node.b;
        if(!hasCut(branch))aLength=inA?value:length-p.gap-value;
      }
      const bLength=length-p.gap-aLength;if(Math.min(aLength,bLength)<=0)throw new Error('尺寸过大，相邻格子没有可用空间');
      if(horizontal){place(node.a,x,y,aLength,d);place(node.b,x+aLength+p.gap,y,bLength,d);}
      else{place(node.a,x,y,w,aLength);place(node.b,x,y+aLength+p.gap,w,bLength);}
    }
    const left=Math.min(...next.cells.map(c=>c.x-c.width/2)),bottom=Math.min(...next.cells.map(c=>c.y-c.depth/2)),w=Math.max(...next.cells.map(c=>c.x+c.width/2))-left,d=Math.max(...next.cells.map(c=>c.y+c.depth/2))-bottom;
    if(!hasCut(tree)){if(Math.abs(cell[key]-value)>.001)throw new Error('该方向没有相邻格子可调整；请增加分格或修改抽屉尺寸');return next;}
    place(tree,left,bottom,w,d);
    if(Math.abs(cell[key]-value)>.001)throw new Error('无法在当前分格中设置该尺寸');
    const valid=validate(next);if(!valid.valid)throw new Error(valid.errors[0]);
    next.layout.mode='CUSTOM';return next;
  }
  function resizeDrawer(doc,changes,options={}) {
    try{return fitToDrawer(doc,changes,options);}catch(original){
      const next=clone(doc);
      for(const key of ['width','depth','drawer_height'])if(Object.hasOwn(changes,key)){
        const value=changes[key],[lo,hi]=ranges[key];if(!Number.isFinite(value)||value<lo||value>hi)throw original;next.settings[key]=value;
      }
      const p=next.settings;p.height=Math.min(p.height,heightLimit(next));
      if(p.height<=p.base+.2||next.layers===2&&p.height<7)throw original;
      const mode=next.layers===2?'DOUBLE_RANDOM':'RANDOM',start=Math.max(1,next.cells.length||((options.columns||3)*(options.rows||2))),minimum=Math.max(4,2*p.wall+.1,next.layers===2?(2*p.wall+2*p.slide_clearance)/p.upper_depth_ratio+2*Math.max(p.radius,p.wall)+2*p.slide_clearance+.1:0,2*p.radius+.1);
      // Preserve the requested net dimensions; rebuild instead of enlarging an unprintable box.
      for(const minSize of [...new Set([Math.max(minimum,next.layout.minSize||40),minimum])])for(let count=start;count<=100;count++){
        try{const result=createLayout(next,{...next.layout,mode,count,minSize});result.drawerConfigured=true;return result;}catch{}
      }
      throw new Error('净尺寸无法生成可打印布局（最多100格），请检查盒高、壁厚、间隙和打印空间');
    }
  }
  function fitToDrawer(doc, changes, {columns=3,rows=2}={}) {
    const next=clone(doc);
    for(const key of ['width','depth','drawer_height','gap','margin'])if(Object.hasOwn(changes,key)){
      const value=changes[key],[lo,hi]=ranges[key];
      if(typeof value!=='number'||!Number.isFinite(value)||value<lo||value>hi)throw new Error('抽屉净尺寸须在允许范围内');
      next.settings[key]=value;
    }
    const p=next.settings;if(next.layers===2&&p.upper_height>0)p.upper_height=Math.min(p.upper_height,p.bed_z,p.drawer_height-7);const m=margin(p),availableX=p.width-2*m,availableY=p.depth-2*m,limit=heightLimit(next);
    if(availableX<=0||availableY<=0)throw new Error('抽屉净宽和净深不足以容纳四周间隙');
    if(limit<=p.base+.2||next.layers===2&&limit<7)throw new Error('抽屉净高不足以容纳盒底或双层结构');
    p.height=round(Math.min(p.height,limit));
    if(next.layers===2)next.cells.forEach(c=>{if(c.upper_height>0)c.upper_height=Math.min(c.upper_height,p.bed_z,p.drawer_height-7);c.height=round(Math.min(c.height,heightLimit(next,c)));});else next.cells.forEach(c=>c.height=round(Math.min(c.height,limit)));
    if(p.chamfer_enabled)p.chamfer_size=Math.min(p.chamfer_size,chamferLimit(next));
    if(!next.cells.length){next.cells=grid(next,columns,rows);next.layout=layoutOptions({mode:next.layers===2?'DOUBLE_GRID':'GRID',columns,rows});}
    else {
      // Partition complete row/column cuts first, then allocate only the box
      // footprints proportionally. Old empty bands never become scaled gaps.
      function place(node,x,y,w,d){
        if(node.cell){Object.assign(node.cell,{x:round(x+w/2),y:round(y+d/2),width:round(w),depth:round(d)});return;}
        if(node.axis==='x'){
          const aWidth=(w-p.gap*node.gx)*node.a.w/node.w+p.gap*node.a.gx;
          place(node.a,x,y,aWidth,d);place(node.b,x+aWidth+p.gap,y,w-aWidth-p.gap,d);
        }else if(node.axis==='y'){
          const aDepth=(d-p.gap*node.gy)*node.a.d/node.d+p.gap*node.a.gy;
          place(node.a,x,y,w,aDepth);place(node.b,x,y+aDepth+p.gap,w,d-aDepth-p.gap);
        }else{
          // Non-slicing free layouts retain their deliberate empty spaces.
          const left=Math.min(...node.cells.map(c=>c.x-c.width/2)),bottom=Math.min(...node.cells.map(c=>c.y-c.depth/2));
          const sx=(w+p.gap)/(node.w+p.gap),sy=(d+p.gap)/(node.d+p.gap);
          for(const c of node.cells){c.x=round(x+(c.x-left+p.gap/2)*sx-p.gap/2);c.y=round(y+(c.y-bottom+p.gap/2)*sy-p.gap/2);c.width=round((c.width+p.gap)*sx-p.gap);c.depth=round((c.depth+p.gap)*sy-p.gap);}
        }
      }
      place(partitionLayout(next.cells),-availableX/2,-availableY/2,availableX,availableY);
    }
    const valid=validate(next);
    if(!valid.valid){const hint=valid.errors.some(e=>e.includes('打印空间'))?'请增加分格数量、重新生成布局或减小格子尺寸':'请增大净尺寸或减少分格';throw new Error('无法贴合当前分格：'+valid.errors[0]+'；'+hint);}
    next.drawerConfigured=true;
    return next;
  }
  function parseDocument(input, {allowEmpty=false}={}) {
    const data=typeof input==='string'?JSON.parse(input):input;
    if(!data||data.schema!=='drawer-organizer-layout'||data.version!==1||data.units!=='mm'||data.coordinates!=='center_xy_y_up')throw new Error('文件不是受支持的抽屉布局，须使用本网页导出的布局文件');
    if(data.layers!==1&&data.layers!==2)throw new Error('层数仅支持 1 或 2');
    const settings={};for(const[k,[lo,hi]]of Object.entries(ranges)){const v=k==='upper_height'&&data.settings?.[k]===undefined?0:data.settings?.[k];if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi||(k==='segments'&&!Number.isInteger(v)))throw new Error('参数 '+k+' 无效');settings[k]=v;}
    if(data.settings.drawer_visible!==undefined&&typeof data.settings.drawer_visible!=='boolean')throw new Error('抽屉外形开关无效');
    if(data.settings.drawer_display!==undefined&&!['SOLID','WIRE'].includes(data.settings.drawer_display))throw new Error('抽屉外形显示方式无效');
    settings.drawer_visible=data.settings.drawer_visible??true;settings.drawer_display=data.settings.drawer_display??'SOLID';
    if(typeof data.settings.chamfer_enabled!=='boolean')throw new Error('倒角开关无效');settings.chamfer_enabled=data.settings.chamfer_enabled;
    if(!Array.isArray(data.cells)||data.cells.length<(allowEmpty?0:1)||data.cells.length>100)throw new Error('布局应包含 1 至 100 个格子');
    const ids=new Set(),cells=data.cells.map((c,i)=>{const result={id:typeof c.id==='string'?c.id:'box-'+i,name:typeof c.name==='string'?c.name.slice(0,50):'格子 '+(i+1)};if(!result.id||result.id.length>100||ids.has(result.id))throw new Error('格子编号重复或无效');ids.add(result.id);for(const k of ['width','depth','height','x','y']){const v=c[k];if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>3000||(['width','depth','height'].includes(k)&&v<=0)||k==='height'&&v>1000)throw new Error('格子 '+(i+1)+' 尺寸或位置无效');result[k]=v;}for(const k of ['upper_depth_ratio','slide_clearance','slide_position','upper_height'])if(c[k]!==undefined){const v=c[k],[lo,hi]=ranges[k];if(!Number.isFinite(v)||v<lo||v>hi)throw new Error('格子上层参数无效');result[k]=v;}return result;});
    return {schema:data.schema,version:1,units:'mm',coordinates:data.coordinates,name:typeof data.name==='string'?data.name.slice(0,80):'我的抽屉',drawerConfigured:data.drawerConfigured===true,layout:layoutOptions(data.layout??{mode:'CUSTOM'}),layers:data.layers,settings,cells};
  }
  return {layoutDefaults,layoutOptions,createLayout,defaults,ranges,clone,round,createDefault,margin,upperHeight,heightLimit,chamferLimit,orientation,slide,overlap,cellErrors,validate,fits,snap,resize,add,grid,fitToDrawer,adaptCell,resizeDrawer,parseDocument};
});
