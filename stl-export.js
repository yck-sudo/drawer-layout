/* Browser-local binary STL and stored ZIP. Coordinates are millimetres. */
const DrawerSTL=(()=>{
  const C=DrawerLayout;
  function mesh(doc,cell,lower){
    const p=doc.settings,profiles=DrawerPreview.prototype.profiles.call({doc},cell,p,lower),segments=p.segments;
    const rings=profiles.map(([w,d,r,z])=>{
      r=Math.max(0,Math.min(r,w/2-.001,d/2-.001));
      const centers=[[w/2-r,-d/2+r],[w/2-r,d/2-r],[-w/2+r,d/2-r],[-w/2+r,-d/2+r]],out=[];
      for(let corner=0;corner<4;corner++)for(let step=0;step<=segments;step++){
        const a=(-90+corner*90+step*90/segments)*Math.PI/180;
        out.push([centers[corner][0]+r*Math.cos(a),centers[corner][1]+r*Math.sin(a),z].map(Math.fround));
      }return out;
    });
    const triangles=[],n=rings[0].length;
    function triangle(a,b,c){const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal);if(length>1e-10)triangles.push({points:[a,b,c],normal:normal.map(x=>x/length)});}
    for(let k=0;k<rings.length-1;k++)for(let i=0;i<n;i++){const j=(i+1)%n;triangle(rings[k][i],rings[k][j],rings[k+1][j]);triangle(rings[k][i],rings[k+1][j],rings[k+1][i]);}
    const bottom=rings[0],floor=rings.at(-1);
    for(let i=0;i<n;i++){const j=(i+1)%n;triangle([0,0,bottom[0][2]],bottom[j],bottom[i]);triangle([0,0,floor[0][2]],floor[i],floor[j]);}
    const rotation=C.orientation(cell.width,cell.depth,cell.height+(lower?1.2:0),p);
    if(rotation===null)throw new Error('模型超过打印空间');
    if(rotation===90)for(const t of triangles){t.points=t.points.map(([x,y,z])=>[-y,x,z]);const [x,y,z]=t.normal;t.normal=[-y,x,z];}
    return triangles;
  }
  function binary(triangles){const buffer=new ArrayBuffer(84+triangles.length*50),view=new DataView(buffer);new Uint8Array(buffer).set(new TextEncoder().encode('Drawer organizer | millimetres | watertight individual box'));view.setUint32(80,triangles.length,true);let o=84;for(const t of triangles){for(const v of [...t.normal,...t.points.flat()]){view.setFloat32(o,v,true);o+=4;}view.setUint16(o,0,true);o+=2;}return new Uint8Array(buffer);}
  function models(doc,id=null){const result=C.validate(doc);if(!doc.drawerConfigured||!result.valid)throw new Error(result.errors[0]||'请先设置抽屉尺寸');const cells=id===null?doc.cells:doc.cells.filter(c=>c.id===id);if(!cells.length)throw new Error('请先选择格子');const out=[];for(const c of cells){const index=doc.cells.indexOf(c)+1,name=String(index).padStart(2,'0')+'-'+(c.name.replace(/[\\/:*?"<>|]/g,'_')||'格子');out.push({name:name+(doc.layers===2?'-下层':'')+'.stl',data:binary(mesh(doc,c,doc.layers===2))});if(doc.layers===2)out.push({name:name+'-上层.stl',data:binary(mesh(doc,{...c,...C.slide(doc.settings,c)},false))});}return out;}
  const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  function crc(data){let n=0xffffffff;for(const b of data)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
  function zip(files){const parts=[],directory=[];let offset=0;for(const file of files){const name=new TextEncoder().encode(file.name),size=file.data.length,checksum=crc(file.data),local=new Uint8Array(30+name.length),l=new DataView(local.buffer);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,0x21,true);l.setUint32(14,checksum,true);l.setUint32(18,size,true);l.setUint32(22,size,true);l.setUint16(26,name.length,true);local.set(name,30);parts.push(local,file.data);const central=new Uint8Array(46+name.length),v=new DataView(central.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,0x21,true);v.setUint32(16,checksum,true);v.setUint32(20,size,true);v.setUint32(24,size,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);central.set(name,46);directory.push(central);offset+=local.length+size;}
    const length=directory.reduce((n,d)=>n+d.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,length,true);v.setUint32(16,offset,true);const out=new Uint8Array(offset+length+22);let pos=0;for(const part of [...parts,...directory,end]){out.set(part,pos);pos+=part.length;}return out;
  }
  return {mesh,binary,models,zip};
})();
