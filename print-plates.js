/* Independent flat-bottom objects, millimetres; deterministic shelf-free packing. */
const DrawerPlates=(()=>{
  const encode=s=>new TextEncoder().encode(s),xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function items(doc){
    const files=DrawerSTL.models(doc);
    return files.map(file=>{
      const v=new DataView(file.data.buffer,file.data.byteOffset,file.data.byteLength),triangles=[],lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<v.getUint32(80,true);i++){
        const points=Array.from({length:3},(_,k)=>Array.from({length:3},(_,j)=>v.getFloat32(84+i*50+12+k*12+j*4,true)));
        for(const p of points)for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],p[j]);hi[j]=Math.max(hi[j],p[j]);}
        triangles.push({points,normal:Array.from({length:3},(_,j)=>v.getFloat32(84+i*50+j*4,true))});
      }
      return {name:file.name,triangles,lo,width:hi[0]-lo[0],depth:hi[1]-lo[1]};
    });
  }
  function pack(doc,gap=3,excluded=[]){
    if(!Number.isFinite(gap)||gap<0||gap>50)throw new Error('摆盘间距应为 0–50 mm');
    const p=doc.settings,plates=[];
    for(const item of items(doc).sort((a,b)=>b.width*b.depth-a.width*a.depth)){
      let best=null;
      function consider(plate,index){for(let f=0;f<plate.free.length;f++)for(const rotated of [false,true]){
        const w=rotated?item.depth:item.width,d=rotated?item.width:item.depth,r=plate.free[f];
        if(w<=r.w+1e-4&&d<=r.d+1e-4){const score=Math.min(r.w-w,r.d-d)*1e9+r.w*r.d-w*d;if(!best||score<best.score)best={plate,index,f,rotated,w,d,r,score};}
      }}
      plates.forEach(consider);
      if(!best){const plate={items:[],free:[{x:0,y:0,w:p.bed_x,d:p.bed_y}]};
        for(const e of excluded)plate.free=plate.free.flatMap(r=>{
          const x=Math.max(r.x,e.x),y=Math.max(r.y,e.y),right=Math.min(r.x+r.w,e.x+e.w),top=Math.min(r.y+r.d,e.y+e.d);
          if(right<=x||top<=y)return [r];
          return [{x:r.x,y:r.y,w:x-r.x,d:r.d},{x:right,y:r.y,w:r.x+r.w-right,d:r.d},{x,y:r.y,w:right-x,d:y-r.y},{x,y:top,w:right-x,d:r.y+r.d-top}].filter(r=>r.w>0&&r.d>0);
        });plates.push(plate);consider(plate,plates.length-1);}
      if(!best)throw new Error(item.name+' 无法放入打印平台');
      const {plate,f,r,w,d,rotated}=best;plate.free.splice(f,1);
      if(r.w>w+gap)plate.free.push({x:r.x+w+gap,y:r.y,w:r.w-w-gap,d:r.d});
      if(r.d>d+gap)plate.free.push({x:r.x,y:r.y+d+gap,w:Math.min(w,r.w),d:r.d-d-gap});
      const placed={...item,x:r.x,y:r.y,w,d,rotated};
      placed.triangles=item.triangles.map(t=>({normal:rotated?[-t.normal[1],t.normal[0],t.normal[2]]:t.normal,points:t.points.map(a=>{
        const x=a[0]-item.lo[0],y=a[1]-item.lo[1];return rotated?[r.x+item.depth-y,r.y+x,a[2]-item.lo[2]]:[r.x+x,r.y+y,a[2]-item.lo[2]];
      })}));plate.items.push(placed);
    }
    for(const plate of plates){
      const minX=Math.min(...plate.items.map(i=>i.x)),minY=Math.min(...plate.items.map(i=>i.y)),maxX=Math.max(...plate.items.map(i=>i.x+i.w)),maxY=Math.max(...plate.items.map(i=>i.y+i.d));
      const targetX=(p.bed_x-minX-maxX)/2,targetY=(p.bed_y-minY-maxY)/2;
      const clampX=x=>Math.max(-minX,Math.min(p.bed_x-maxX,x)),clampY=y=>Math.max(-minY,Math.min(p.bed_y-maxY,y));
      const xs=new Set([clampX(targetX),clampX(0)]),ys=new Set([clampY(targetY),clampY(0)]);
      // The nearest valid translation lies at the target or an obstacle boundary.
      for(const item of plate.items)for(const e of excluded){xs.add(clampX(e.x-item.x-item.w));xs.add(clampX(e.x+e.w-item.x));ys.add(clampY(e.y-item.y-item.d));ys.add(clampY(e.y+e.d-item.y));}
      let best=null;
      for(const x of xs)for(const y of ys){
        const distance=(x-targetX)**2+(y-targetY)**2;
        if(best&&distance>=best.distance)continue;
        if(plate.items.some(i=>excluded.some(e=>i.x+x<e.x+e.w-1e-5&&i.x+i.w+x>e.x+1e-5&&i.y+y<e.y+e.d-1e-5&&i.y+i.d+y>e.y+1e-5)))continue;
        best={x,y,distance};
      }
      if(best)for(const item of plate.items){
        item.x+=best.x;item.y+=best.y;
        for(const triangle of item.triangles)triangle.points=triangle.points.map(([x,y,z])=>[x+best.x,y+best.y,z]);
      }
    }
    return plates;
  }
  function threeMF(plate){
    const resources=plate.items.map((item,i)=>{
      const vertices=[],faces=[],seen=new Map();
      for(const t of item.triangles){const ids=t.points.map(p=>{const key=p.join(',');if(!seen.has(key)){seen.set(key,vertices.length);vertices.push(p);}return seen.get(key);});faces.push(ids);}
      return `<object id="${i+1}" type="model" name="${xml(item.name)}"><mesh><vertices>${vertices.map(p=>`<vertex x="${p[0]}" y="${p[1]}" z="${p[2]}"/>`).join('')}</vertices><triangles>${faces.map(t=>`<triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}"/>`).join('')}</triangles></mesh></object>`;
    }).join('');
    return DrawerSTL.zip([
      {name:'[Content_Types].xml',data:encode('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')},
      {name:'_rels/.rels',data:encode('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')},
      {name:'3D/3dmodel.model',data:encode(`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="zh-CN" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${resources}</resources><build>${plate.items.map((_,i)=>`<item objectid="${i+1}"/>`).join('')}</build></model>`)}
    ]);
  }
  function files(doc,gap){
    const plates=pack(doc,gap),out=[],p=doc.settings;
    plates.forEach((plate,i)=>{
      const name='打印盘-'+String(i+1).padStart(2,'0');out.push({name:name+'.3mf',data:threeMF(plate)});
      out.push({name:name+'.stl',data:DrawerSTL.binary(plate.items.flatMap(item=>item.triangles))});
      out.push({name:name+'.svg',data:encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${p.bed_x+4} ${p.bed_y+4}"><rect width="${p.bed_x}" height="${p.bed_y}" fill="#252825" stroke="#888"/>${plate.items.map(item=>`<g><rect x="${item.x}" y="${p.bed_y-item.y-item.d}" width="${item.w}" height="${item.d}" fill="#778d80" stroke="#ddd" stroke-width=".3"/><text x="${item.x+item.w/2}" y="${p.bed_y-item.y-item.d/2}" text-anchor="middle" font-family="PingFang SC,OPPO Sans,Microsoft YaHei,Arial,sans-serif" font-size="4" fill="white">${xml(item.name.replace('.stl',''))}</text></g>`).join('')}</svg>`)});
    });
    out.push({name:'摆盘说明.txt',data:encode(`共 ${plates.length} 盘；打印空间 ${p.bed_x} × ${p.bed_y} × ${p.bed_z} mm；模型间距 ${gap} mm。\n每盘的 3MF 和 STL 内容相同，任选一种导入，避免重复导入。3MF 保留独立对象和摆放位置；STL 为已摆放的整盘模型。\n模型平底朝下，可在 W/L 平面旋转90度。平台边缘未额外留白；裙边、支撑、擦拭塔及打印机禁用区域请在切片软件中检查。文件不含打印机配置或G-code。\n\n${plates.map((plate,i)=>`打印盘 ${i+1}：${plate.items.map(item=>item.name).join('、')}`).join('\n')}`)});
    return {files:out,count:plates.length};
  }
  const software={bambu:{name:'拓竹 Bambu Studio',application:'BambuStudio-02.00.00.00'},orca:{name:'OrcaSlicer',application:'OrcaSlicer-2.3.0'},creality:{name:'创想 Creality Print',application:'Creality_Print V6.0.0'}};
  const printers=[
    {id:'current',name:'当前打印空间（自定义）'},
    {id:'a1mini',name:'Bambu Lab A1 mini',size:[180,180,180],family:'bambu'},
    {id:'a1',name:'Bambu Lab A1',size:[256,256,256],family:'bambu'},
    {id:'p1s',name:'Bambu Lab P1S',size:[256,256,256],family:'bambu',excluded:[{x:0,y:0,w:18,d:28}]},
    {id:'x1c',name:'Bambu Lab X1 Carbon',size:[256,256,256],family:'bambu',excluded:[{x:0,y:0,w:18,d:28}]},
    {id:'k1',name:'Creality K1',size:[220,220,250],family:'creality'},
    {id:'k1max',name:'Creality K1 Max',size:[300,300,300],family:'creality'}
  ];
  function prepare(doc,gap,target='bambu',printerId='current'){
    const adapter=software[target],printer=printers.find(p=>p.id===printerId);
    if(!adapter||!printer||(printer.family&&target!=='orca'&&printer.family!==target))throw new Error('请选择有效的切片软件和打印机');
    const snapshot=DrawerLayout.clone(doc),p=snapshot.settings;
    if(printer.size)[p.bed_x,p.bed_y,p.bed_z]=printer.size;
    const plates=pack(snapshot,gap,printer.excluded||[]);
    if(plates.length>36)throw new Error('当前需要 '+plates.length+' 盘，超过多盘工程的 36 盘上限；请增大打印空间或减少盒子数量');
    return {snapshot,plates,printer,target};
  }
  function project(doc,gap,target='bambu',printerId='current',png=null,cover=null,prepared=null){
    const thumbnail=cover||png,{snapshot,plates,printer}=prepared||prepare(doc,gap,target,printerId),p=snapshot.settings,adapter=software[target],cols=Math.ceil(Math.sqrt(plates.length));
    const resources=[],build=[],configs=[],plateConfigs=[];let id=0;
    for(const [index,plate] of plates.entries()){
      const ox=index%cols*p.bed_x*1.2,oy=-Math.floor(index/cols)*p.bed_y*1.2,instances=[];
      for(const item of plate.items){
        id++;const vertices=[],faces=[],seen=new Map();
        for(const t of item.triangles){const ids=t.points.map(point=>{const key=point.join(',');if(!seen.has(key)){seen.set(key,vertices.length);vertices.push(point);}return seen.get(key);});faces.push(ids);}
        resources.push(`<object id="${id}" type="model" name="${xml(item.name)}"><mesh><vertices>${vertices.map(v=>`<vertex x="${v[0]}" y="${v[1]}" z="${v[2]}"/>`).join('')}</vertices><triangles>${faces.map(f=>`<triangle v1="${f[0]}" v2="${f[1]}" v3="${f[2]}"/>`).join('')}</triangles></mesh></object>`);
        build.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${ox} ${oy} 0" printable="1"/>`);
        configs.push(`<object id="${id}"><metadata key="name" value="${xml(item.name.replace('.stl',''))}"/><metadata key="extruder" value="1"/><part id="${id}" subtype="normal_part"><metadata key="name" value="${xml(item.name)}"/></part></object>`);
        instances.push(`<model_instance><metadata key="object_id" value="${id}"/><metadata key="instance_id" value="0"/><metadata key="identify_id" value="${id}"/></model_instance>`);
      }
      plateConfigs.push(`<plate><metadata key="plater_id" value="${index+1}"/><metadata key="plater_name" value="打印盘 ${index+1}"/><metadata key="locked" value="false"/>${instances.join('')}</plate>`);
    }
    // Native project importers require these preset slots even for geometry-only projects.
    const setting={printer_settings_id:'',print_settings_id:'',filament_settings_id:[''],nozzle_diameter:['0.4'],inherits_group:['','',''],printable_area:['0x0',`${p.bed_x}x0`,`${p.bed_x}x${p.bed_y}`,`0x${p.bed_y}`],printable_height:String(p.bed_z),printer_technology:'FFF',bed_exclude_area:printer.excluded?['0x0','18x0','18x28','0x28']:[]};
    if(printer.size){setting.printer_model=printer.name;setting.printer_variant='0.4';setting.printer_settings_id=printer.name+' 0.4 nozzle';}
    const out=[
      {name:'[Content_Types].xml',data:encode('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/xml"/><Default Extension="json" ContentType="application/json"/><Default Extension="png" ContentType="image/png"/><Override PartName="/Metadata/project_settings.config" ContentType="application/json"/></Types>')},
      {name:'_rels/.rels',data:encode(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>${thumbnail?'<Relationship Target="/Metadata/thumbnail.png" Id="rel1" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>':''}</Relationships>`)},
      {name:'3D/3dmodel.model',data:encode(`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="zh-CN" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"><metadata name="Application">${adapter.application}</metadata><metadata name="BambuStudio:3mfVersion">1</metadata>${target==='orca'?'<metadata name="OrcaSlicer">2.3.0</metadata>':''}<metadata name="Title">${xml(doc.name)}</metadata><metadata name="Description">Created by Drawer Layout Studio; ${plates.length} plates</metadata><resources>${resources.join('')}</resources><build>${build.join('')}</build></model>`)},
      {name:'Metadata/model_settings.config',data:encode(`<?xml version="1.0" encoding="UTF-8"?><config>${configs.join('')}${plateConfigs.join('')}</config>`)},
      {name:'Metadata/project_settings.config',data:encode(JSON.stringify(setting))},
      {name:'Metadata/drawer-layout.json',data:encode(JSON.stringify(doc))}
    ];
    if(target==='creality')out.push({name:'Metadata/creality.config',data:encode('<?xml version="1.0" encoding="UTF-8"?><config><metadata key="Company" value="CrealityPrint"/><metadata key="Application" value="Creality_Print"/><metadata key="AppVersion" value="6.0.0"/></config>')});
    if(thumbnail){out.push({name:'Metadata/thumbnail.png',data:thumbnail});out.push({name:'Metadata/plate_1.png',data:thumbnail});out.push({name:'Auxiliaries/.thumbnails/thumbnail_3mf.png',data:thumbnail});}
    if(png)out.push({name:'Metadata/layout-preview.png',data:png});
    return {data:DrawerSTL.zip(out),count:plates.length,objects:id};
  }
  return {pack,files,prepare,project,software,printers};
})();
