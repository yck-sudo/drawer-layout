/* Standalone browser-local appearance preview. */
class DrawerPreview {
  constructor(canvas){this.canvas=canvas;this.angle=-Math.PI/4;this.pitch=Math.atan(1/Math.sqrt(2));this.pending=false;this.doc=null;this.zoom=1;this.offset={x:0,y:0};this.tool="select";let drag=null;
    this.clearHover=()=>{if(this.hoveredId){this.hoveredId=null;this.hoveredLayer=null;this.schedule();}this.onHover?.(null);};
    const hover=e=>{const rect=canvas.getBoundingClientRect(),hit=this.pick(e.clientX-rect.left,e.clientY-rect.top);if(this.hoveredId!==hit?.id||this.hoveredLayer!==hit?.layer){this.hoveredId=hit?.id??null;this.hoveredLayer=hit?.layer??null;this.schedule();}this.onHover?.(hit,e);};
    canvas.addEventListener('pointerleave',()=>this.clearHover());
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==1)return;e.preventDefault();this.clearHover();drag={x:e.clientX,y:e.clientY,a:this.angle,p:this.pitch,id:e.pointerId,offset:{...this.offset},mode:e.button===1?'pan':'rotate',moved:false};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!drag){hover(e);return;}if(drag.id!==e.pointerId)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4)drag.moved=true;if(!drag.moved)return;if(drag.mode==='pan')this.offset={x:drag.offset.x+e.clientX-drag.x,y:drag.offset.y+e.clientY-drag.y};else{this.angle=drag.a+(e.clientX-drag.x)*.012;this.pitch=Math.max(.2,Math.min(Math.PI/2,drag.p+(e.clientY-drag.y)*.009));}this.schedule();});
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.clearHover();this.zoom=Math.max(.5,Math.min(3,this.zoom*(e.deltaY<0?1.12:.89)));this.schedule();},{passive:false});
    canvas.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
    const end=()=>drag=null;canvas.addEventListener('pointerup',e=>{if(drag&&drag.id===e.pointerId&&drag.mode==='rotate'&&!drag.moved){const rect=canvas.getBoundingClientRect();const hit=this.pick(e.clientX-rect.left,e.clientY-rect.top);this.onSelect?.(hit?.id??null,hit?.layer??null);}end();});canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
  }
  pick(x,y){let best=null,depth=-Infinity;
    for(const face of this.hitFaces??[]){if(face.wire)continue;const points=face.screenPoints;for(let i=1;i<points.length-1;i++){
      const [a,b,c]=[points[0],points[i],points[i+1]],den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-8)continue;
      const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,t=1-u-v;
      if(Math.min(u,v,t)<-1e-6)continue;const z=u*a[2]+v*b[2]+t*c[2];if(z>depth){depth=z;best=face.info;}
    }}return best;
  }
  fit(){this.zoom=1;this.offset={x:0,y:0};this.frame=null;this.schedule();}
  setView(view){this.angle=view==='iso'?-Math.PI/4:0;this.pitch=view==='iso'?Math.atan(1/Math.sqrt(2)):Math.PI/2;this.fit();}
  reset(){this.setView('iso');}
  update(doc,selected,layer='下层'){this.doc=doc;this.selected=selected;this.selectedLayer=layer;this.schedule();}
  schedule(){if(this.pending)return;this.pending=true;requestAnimationFrame(()=>{this.pending=false;this.draw();});}
  ring(w,d,r){r=Math.max(0,Math.min(r,w/2-.001,d/2-.001));const centers=[[w/2-r,-d/2+r],[w/2-r,d/2-r],[-w/2+r,d/2-r],[-w/2+r,-d/2+r]],out=[];
    const segments=this.doc?.settings.segments??8;for(let corner=0;corner<4;corner++)for(let step=0;step<=segments;step++){const a=(-90+corner*90+step*90/segments)*Math.PI/180;out.push([centers[corner][0]+r*Math.cos(a),centers[corner][1]+r*Math.sin(a)]);}return out;
  }
  profiles(c,p,lower){const w=c.width,d=c.depth,h=c.height,r=c.radius??p.radius,t=p.wall,b=p.chamfer_enabled?Math.min(p.chamfer_size,DrawerLayout.chamferLimit(this.doc)):0;
    if(lower){const q=t/2,inner=r?r-t:0;let rings=[[w,d,r,0],[w,d,r,h+1.2],[w-2*q,d-2*q,r?r-q:0,h+1.2],[w-2*q,d-2*q,r?r-q:0,h],[w-2*t,d-2*t,inner,h],[w-2*t,d-2*t,inner,p.base]];
      if(b)rings=[rings[0],[w,d,r,h+1.2-b],[w-2*b,d-2*b,r?r-b:0,h+1.2],[w-2*q+2*b,d-2*q+2*b,r?r-q+b:0,h+1.2],[w-2*q,d-2*q,r?r-q:0,h+1.2-b],...rings.slice(3)];return rings;
    }
    if(b)return [[w,d,r,0],[w,d,r,h-b],[w-2*b,d-2*b,r?r-b:0,h],[w-2*t+2*b,d-2*t+2*b,r?r-t+b:0,h],[w-2*t,d-2*t,r?r-t:0,h-b],[w-2*t,d-2*t,r?r-t:0,p.base]];
    return [[w,d,r,0],[w,d,r,h],[w-2*t,d-2*t,r?r-t:0,h],[w-2*t,d-2*t,r?r-t:0,p.base]];
  }
  solid(ctx,faces,screen,w,h,dpr){
    if(this.gl===undefined){
      this.surface=document.createElement('canvas');this.gl=this.surface.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true});
      if(this.gl){const gl=this.gl,shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);return s;};
        this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,'attribute vec3 position; attribute vec3 color; varying vec3 tint; void main(){gl_Position=vec4(position,1.0);tint=color;}'));gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,'precision mediump float; varying vec3 tint; void main(){gl_FragColor=vec4(tint,1.0);}'));gl.linkProgram(this.program);this.buffer=gl.createBuffer();
      }
    }
    const gl=this.gl;if(!gl||gl.isContextLost())return false;
    this.surface.width=Math.round(w*dpr);this.surface.height=Math.round(h*dpr);gl.viewport(0,0,this.surface.width,this.surface.height);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
    let extent=1;for(const face of faces)for(const v of face.points)extent=Math.max(extent,Math.abs(v[2])+1);
    const vertices=[];for(const face of faces){if(face.wire)continue;const color=face.color.match(/\d+/g).map(v=>Number(v)/255);for(let i=1;i<face.points.length-1;i++)for(const v of [face.points[0],face.points[i],face.points[i+1]]){const q=screen(v);vertices.push(q[0]/w*2-1,1-q[1]/h*2,-v[2]/extent,...color);}}
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
    for(const [name,offset] of [['position',0],['color',12]]){const loc=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,24,offset);}
    gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);gl.drawArrays(gl.TRIANGLES,0,vertices.length/6);gl.disable(gl.POLYGON_OFFSET_FILL);
    const lines=[],seen=new Set();for(const face of faces){if(!face.info||face.info.id!==this.hoveredId||face.info.layer!==this.hoveredLayer||(face.info.id===this.selected&&face.info.layer===this.selectedLayer))continue;for(let i=0;i<face.points.length;i++){const a=face.points[i],b=face.points[(i+1)%face.points.length],worldZ=v=>-v[1]*Math.cos(this.pitch)+v[2]*Math.sin(this.pitch);if(Math.abs(worldZ(a)-worldZ(b))>1e-5)continue;const key=[a,b].map(v=>v.map(x=>x.toFixed(5)).join(',')).sort().join('|');if(seen.has(key))continue;seen.add(key);for(const v of [a,b]){const q=screen(v);lines.push(q[0]/w*2-1,1-q[1]/h*2,-v[2]/extent,.98,.91,.59);}}}
    if(lines.length){gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(lines),gl.DYNAMIC_DRAW);gl.drawArrays(gl.LINES,0,lines.length/6);}
    ctx.drawImage(this.surface,0,0,w,h);return true;
  }
  project(v){const ca=Math.cos(this.angle),sa=Math.sin(this.angle),sp=Math.sin(this.pitch),cp=Math.cos(this.pitch),depth=v[0]*sa+v[1]*ca;return [v[0]*ca-v[1]*sa,-depth*sp-v[2]*cp,-depth*cp+v[2]*sp];}
  draw(){const doc=this.doc;if(!doc)return;const canvas=this.canvas,rect=canvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;const w=rect.width,h=rect.height,dpr=Math.max(2,Math.min(3,devicePixelRatio||1));canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,w,h);const p=doc.settings;
    const project=v=>this.project(v);
    const showShell=p.drawer_visible,maxZ=Math.max(doc.cells.reduce((z,c)=>Math.max(z,c.height+(doc.layers===2?DrawerLayout.upperHeight(p,c):0)),1),showShell?p.drawer_height:0),outerX=p.width/2+(showShell?p.drawer_wall:0),outerY=p.depth/2+(showShell?p.drawer_wall:0),extents=[];for(const x of [-outerX,outerX])for(const y of [-outerY,outerY])for(const z of [showShell?-p.drawer_base:0,maxZ])extents.push(project([x,y,z]));
    const minX=Math.min(...extents.map(v=>v[0])),maxX=Math.max(...extents.map(v=>v[0])),minY=Math.min(...extents.map(v=>v[1])),maxY=Math.max(...extents.map(v=>v[1]));const large=canvas.closest('#main-stage')!==null,padding=large?Math.min(w,h)*.42:40;const frameKey=[w,h,outerX,outerY,maxZ,showShell?p.drawer_base:0].join(',');if(this.frame?.key!==frameKey)this.frame={key:frameKey,scale:Math.min((w-padding)/(maxX-minX),(h-padding)/(maxY-minY))};const scale=this.zoom*this.frame.scale,ox=w/2-(minX+maxX)*scale/2+this.offset.x,oy=h/2-(minY+maxY)*scale/2+this.offset.y;
    const screen=v=>[ox+v[0]*scale,oy+v[1]*scale];
    // Ground sits below the drawer; solid geometry naturally occludes it.
    const ground=showShell?-p.drawer_base:0,span=Math.max(p.width,p.depth)*4,step=50;
    const line=(a,b,color,width)=>{ctx.strokeStyle=color;ctx.lineWidth=width;const u=screen(project(a)),v=screen(project(b));ctx.beginPath();ctx.moveTo(...u);ctx.lineTo(...v);ctx.stroke();};
    for(let v=-Math.ceil(span/step)*step;v<=span;v+=step){if(v===0)continue;line([v,-span,ground],[v,span,ground],'#4b4d4f',.5);line([-span,v,ground],[span,v,ground],'#4b4d4f',.5);}
    line([-span,0,ground],[span,0,ground],'#79565e',1);line([0,-span,ground],[0,span,ground],'#626e50',1);
    const faces=[];
    const add=(c,z,lower,active)=>{if(DrawerLayout.cellErrors(doc,{...c,height:c.height}).length&&lower)return;if(Math.min(c.width,c.depth)<=2*p.wall||c.height<=p.base)return;
      const rings=(c.previewRings??this.profiles(c,p,lower)).map(([rw,rd,r,rz])=>this.ring(rw,rd,r).map(([x,y])=>[x+c.x,y+c.y,rz+z])),n=rings[0].length;
      const polygon=(points)=>{const a=points[0],b=points[1],vertex=points[2],ab=b.map((v,i)=>v-a[i]),ac=vertex.map((v,i)=>v-a[i]);const normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],length=Math.hypot(...normal)||1;
        const shade=.7+.24*Math.max(-.5,(normal[0]*-.3+normal[1]*-.4+normal[2]*.85)/length),base=c.previewRings?[135,150,166]:active?[230,202,111]:c.id===this.hoveredId&&(c.previewLayer??(lower?'下层':doc.layers===2?'上层':'单层'))===this.hoveredLayer?[180,187,178]:[160,168,163];const projected=points.map(project);faces.push({info:c.previewRings?null:{id:c.id,width:c.width,depth:c.depth,height:c.height,layer:c.previewLayer??(lower?'下层':doc.layers===2?'上层':'单层')},points:projected,depth:projected.reduce((n,v)=>n+v[2],0)/points.length,color:'rgb('+base.map(v=>Math.round(v*shade)).join(',')+')',edgeColor:c.previewRings?[78,91,105]:active?[116,105,64]:[94,108,100],wire:false});};
      polygon(rings.at(-1));for(let level=0;level<rings.length-1;level++)for(let i=0;i<n;i++){const j=(i+1)%n;polygon([rings[level][i],rings[level][j],rings[level+1][j],rings[level+1][i]]);}
    };
    if(showShell){const ow=p.width+2*p.drawer_wall,od=p.depth+2*p.drawer_wall,r=Math.min(p.drawer_radius,ow/2-.001,od/2-.001),ir=Math.max(0,r-p.drawer_wall);add({width:ow,depth:od,height:p.drawer_height,x:0,y:0,previewRings:[[ow,od,r,-p.drawer_base],[ow,od,r,p.drawer_height],[p.width,p.depth,ir,p.drawer_height],[p.width,p.depth,ir,0]]},0,false,false);}
    for(const cell of doc.cells){const active=cell.id===this.selected;add({...cell,previewLayer:doc.layers===2?'下层':'单层'},0,doc.layers===2,active&&(doc.layers!==2||this.selectedLayer==='下层'));if(doc.layers===2){const upper=DrawerLayout.slide(p,cell);if(upper.width>0&&upper.depth>0)add({...cell,...upper,previewLayer:'上层'},cell.height,false,active&&this.selectedLayer==='上层');}}
    this.hitFaces=faces.map(face=>({...face,screenPoints:face.points.map(v=>[...screen(v),v[2]])}));
    const depthRendered=this.solid(ctx,faces,screen,w,h,dpr);faces.sort((a,b)=>(+!!a.wire)-(+!!b.wire)||a.depth-b.depth);for(const face of faces){if(depthRendered&&!face.wire)continue;ctx.beginPath();face.points.forEach((v,i)=>{const q=screen(v);if(i)ctx.lineTo(...q);else ctx.moveTo(...q);});ctx.closePath();if(face.wire){ctx.strokeStyle='#b6c9dd';ctx.lineWidth=.8;ctx.stroke();}else{ctx.fillStyle=face.color;ctx.fill();}}
  }
}
