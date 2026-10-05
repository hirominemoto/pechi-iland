import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createAtmosphere,createFireworks} from './atmosphere.js';
import {createResidentRoutes} from './resident-routes.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const $=s=>document.querySelector(s), canvas=$('#world');
let rng=5381;function rnd(){rng=(rng*1664525+1013904223)>>>0;return rng/4294967296}
const clamp=THREE.MathUtils.clamp, mix=THREE.MathUtils.lerp, smooth=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)};
function hash(x,z){const q=Math.sin(x*127.1+z*311.7)*43758.5453;return q-Math.floor(q)}
function noise(x,z){let i=Math.floor(x),j=Math.floor(z),u=x-i,v=z-j;u=u*u*(3-2*u);v=v*v*(3-2*v);return mix(mix(hash(i,j),hash(i+1,j),u),mix(hash(i,j+1),hash(i+1,j+1),u),v)}
function fbm(x,z){return noise(x,z)*.56+noise(x*2.1,z*2.1)*.28+noise(x*4.3,z*4.3)*.12+noise(x*8.7,z*8.7)*.04}
function radius(x,z){const a=Math.atan2(z,x);return Math.hypot(x,z)/(1+.055*Math.sin(a*5)+.035*Math.cos(a*9))}
function baseHeight(x,z){const r=radius(x,z),d=Math.hypot((x+4)*1.03,(z+5)*.96),a=Math.atan2(z+5,x+4);const peak=(cx,cz,rad,h)=>h*Math.pow(Math.max(0,1-Math.max(0,Math.hypot(x-cx,z-cz)-.65)/rad),1.38);let m=Math.max(peak(-4,-5,17,21),peak(2,-10,11,17),peak(-10,-11,11,14));m*=.84+.26*fbm(x*.43,z*.43)+.085*Math.sin(a*6+d*.33)*smooth(1,6,d);m+=(fbm(x*.68,z*.68)-.5)*3.4*smooth(2,8,m);return mix(1.85+.65*fbm(x*.24,z*.24)+m, -4.5,smooth(23,33,r))+.1*(noise(x*2,z*2)-.5)}
function height(x,z){const original=baseHeight(x,z);const cut=(1-smooth(1.65,2.55,Math.abs(x+2)))*smooth(4.5,5.4,z)*(1-smooth(7.8,9,z));return mix(original,Math.min(original,baseHeight(-2,6)-1.65),cut)}
// A closed coastal circuit follows the island outline on all four sides.
const trailRadius=24;
function trailPoint(t){const a=t*Math.PI*2,azimuth=Math.PI/2-a,r=trailRadius*(1+.055*Math.sin(azimuth*5)+.035*Math.cos(azimuth*9));let x=Math.sin(a)*r,z=Math.cos(a)*r;return new THREE.Vector3(x,height(x,z)+.055,z)}
function trailDistance(x,z){return Math.abs(radius(x,z)-trailRadius)}
const scene=new THREE.Scene(); scene.fog=new THREE.FogExp2(0x8adce9,.0012);
// Keep the same viewing angle and distance, with the island higher in the frame.
const overviewView={target:[0,4,0],pos:[63,28,71]};
const camera=new THREE.PerspectiveCamera(45,1,.12,1400);camera.position.set(...overviewView.pos);
let renderer;try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});}catch(e){$('#loading').innerHTML='<h2>3D表示を開始できませんでした</h2><p>WebGL対応のChromeまたはEdgeで開いてください。</p><a href="index-svg.html">SVG版を見る</a>';throw e}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
const controls=new OrbitControls(camera,canvas);controls.target.set(...overviewView.target);controls.enableDamping=true;controls.dampingFactor=.065;controls.minDistance=6;controls.maxDistance=140;controls.maxPolarAngle=Math.PI*.47;controls.minPolarAngle=.15;controls.autoRotate=true;controls.autoRotateSpeed=.48;controls.enablePan=true;
const atmosphere=createAtmosphere(scene);const sunVector=new THREE.Vector3(-.45,.75,.5).normalize();
const hemi=new THREE.HemisphereLight(0xc2edff,0x89a64e,2.7);scene.add(hemi);const sun=new THREE.DirectionalLight(0xfff1cc,3.1);sun.position.copy(sunVector).multiplyScalar(70);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:180});sun.shadow.bias=-.0004;sun.shadow.normalBias=.08;sun.shadow.radius=3;scene.add(sun);sun.target.position.set(0,2,0);scene.add(sun.target);

// Material grain is generated with code; no photograph or external texture is used.
function grain(kind){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),data=ctx.createImageData(256,256);for(let y=0;y<256;y++)for(let x=0;x<256;x++){let n=fbm(x*.045,y*.045),v=kind==='wood'?140+45*Math.sin(x*.2+6*noise(x*.035,y*.01))+rnd()*35:145+n*70+rnd()*35;let o=(y*256+x)*4;data.data[o]=v;data.data[o+1]=v;data.data[o+2]=v;data.data[o+3]=255}ctx.putImageData(data,0,0);const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(kind==='wood'?2:8,kind==='wood'?1:8);return tex}
const stoneTex=grain('stone'),woodTex=grain('wood');
const mat=(color,opt={})=>new THREE.MeshStandardMaterial({color,roughness:.88,...opt});
const wood=mat(0x816047,{map:woodTex,bumpMap:woodTex,bumpScale:.045}), timber=mat(0xc39e69,{map:woodTex,bumpMap:woodTex,bumpScale:.03}),stone=mat(0x7b8375,{map:stoneTex,bumpMap:stoneTex,bumpScale:.14}), leafMat=mat(0x66ac3b,{side:THREE.DoubleSide}), grassMat=mat(0x96bd49,{side:THREE.DoubleSide});
function mesh(geo,material,parent=scene){let m=new THREE.Mesh(geo,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
function sphere(parent,x,y,z,sx,sy,sz,material,segments=12){const m=mesh(new THREE.SphereGeometry(1,segments,Math.max(8,segments/2)),material,parent);m.position.set(x,y,z);m.scale.set(sx,sy,sz);return m}
function box(parent,x,y,z,sx,sy,sz,material){let m=mesh(new THREE.BoxGeometry(sx,sy,sz),material,parent);m.position.set(x,y,z);return m}
function rod(parent,a,b,r1,r2,material,sides=8){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const m=mesh(new THREE.CylinderGeometry(r2,r1,d.length(),sides),material,parent);m.position.copy(av).add(bv).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m}
function bake(group){let byMaterial=new Map;group.updateMatrixWorld(true);group.traverse(o=>{if(!o.isMesh)return;let list=byMaterial.get(o.material)||[];let geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone(); if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));list.push(geo.applyMatrix4(o.matrixWorld));byMaterial.set(o.material,list)});for(const [material,geos]of byMaterial){let m=mesh(mergeGeometries(geos,false),material);for(let g of geos)g.dispose();}group.removeFromParent();}

// Continuous terrain with beach, eroded ridges, exposed rock and moss.
const terrainGeo=new THREE.PlaneGeometry(90,90,290,290);terrainGeo.rotateX(-Math.PI/2);const p=terrainGeo.attributes.position,colors=[];const sandColor=new THREE.Color(0xffe3a5),greenColor=new THREE.Color(0x9bc754),rockColor=new THREE.Color(0xc3bbaa);
for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),h=height(x,z);p.setY(i,h);let slope=Math.hypot(height(x+.3,z)-height(x-.3,z),height(x,z+.3)-height(x,z-.3))/.6;let c=sandColor.clone().lerp(greenColor,smooth(.75,2.2,h));c.lerp(rockColor,smooth(.8,1.9,slope)*.85+smooth(15,24,h)*.3);c.multiplyScalar(.9+fbm(x*.8,z*.8)*.38);colors.push(c.r,c.g,c.b)}terrainGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));terrainGeo.computeVertexNormals();const terrain=mesh(terrainGeo,mat(0xffffff,{vertexColors:true,map:stoneTex,bumpMap:stoneTex,bumpScale:.19}));

// Sample the rendered terrain triangles so hikers stay on the steep mountain surface.
function groundHeight(x,z){
  const gx=clamp((x+45)*290/90,0,289.999999),gz=clamp((z+45)*290/90,0,289.999999),ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz,index=iz*291+ix;
  const h00=p.getY(index),h10=p.getY(index+1),h01=p.getY(index+291),h11=p.getY(index+292);
  return u+v<=1?h00*(1-u-v)+h10*u+h01*v:h11*(u+v-1)+h01*(1-u)+h10*(1-v);
}
const residentRoutes=createResidentRoutes({height:groundHeight,coastPoint:trailPoint});

// Animated waves, reflection, deep/shallow water and broken surf.
const waterUniforms={uTime:{value:0},uSun:{value:sunVector},uWarm:{value:0},uNight:{value:0}};
const ocean=mesh(new THREE.PlaneGeometry(1600,1600,1,1),new THREE.ShaderMaterial({uniforms:waterUniforms,vertexShader:`varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,fragmentShader:`precision highp float;varying vec3 vWorld;uniform float uTime;uniform float uWarm;uniform float uNight;uniform vec3 uSun;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
float wav(vec2 p){return sin(p.x*.78+uTime*.85)*.22+sin(p.y*.63-uTime*.65)*.18+sin(p.x*2.3+p.y*1.7+uTime)*.045+noise(p*5.+uTime*.2)*.06;}
void main(){vec2 p=vWorld.xz;float a=atan(p.y,p.x);float r=length(p)/(1.+.055*sin(a*5.)+.035*cos(a*9.));float dep=smoothstep(27.,64.,r);vec3 base=mix(vec3(.015,.69,.53),vec3(.008,.19,.39),dep);base=mix(base,mix(vec3(.018,.11,.17),vec3(.005,.014,.048),dep),uNight);float h=wav(p);vec3 n=normalize(vec3((wav(p-vec2(.03,0.))-h)/.03,1.,(wav(p-vec2(0.,.03))-h)/.03));vec3 v=normalize(cameraPosition-vWorld);float fres=pow(1.-max(dot(v,n),0.),4.);vec3 skyCol=mix(vec3(.18,.67,.91),vec3(1.,.31,.065),uWarm);skyCol=mix(skyCol,vec3(.023,.037,.1),uNight);base=mix(base,skyCol,fres*mix(.4,.7,uWarm));float spec=pow(max(dot(reflect(-uSun,n),v),0.),170.);base+=mix(vec3(1.,.87,.5),vec3(.36,.6,1.),uNight)*spec*mix(.5,.14,uNight);float foam=smoothstep(.77,.98,sin(r*3.1-uTime*1.4+noise(p*.7)*2.))* (1.-smoothstep(29.6,33.,r))*smoothstep(27.2,29.,r);base=mix(base,vec3(.82,.94,.85),foam*mix(.7,.16,uNight));base+=.012*sin(p.x*9.+h*12.)*(1.-dep);float fog=1.-exp(-length(cameraPosition-vWorld)*.0012);base=mix(base,skyCol,fog);gl_FragColor=vec4(base,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include'),depthWrite:true}));ocean.rotation.x=-Math.PI/2;ocean.position.y=0;ocean.castShadow=false;ocean.receiveShadow=false;

// The footpath hugs the actual land surface.
const pathVerts=[],pathUV=[],pathIds=[];for(let i=0;i<=360;i++){let t=i/360,c=trailPoint(t),next=trailPoint(t+.001),n=next.sub(c).normalize(),side=new THREE.Vector3(-n.z,0,n.x);for(let s of[-1,1]){let v=c.clone().addScaledVector(side,s*1.05);pathVerts.push(v.x,height(v.x,v.z)+.035,v.z);pathUV.push(i/18,(s+1)/2)}if(i<360){let a=i*2;pathIds.push(a,a+2,a+1,a+1,a+2,a+3)}}const pathGeo=new THREE.BufferGeometry();pathGeo.setAttribute('position',new THREE.Float32BufferAttribute(pathVerts,3));pathGeo.setAttribute('uv',new THREE.Float32BufferAttribute(pathUV,2));pathGeo.setIndex(pathIds);pathGeo.computeVertexNormals();mesh(pathGeo,mat(0xf1ce94,{side:THREE.DoubleSide,map:stoneTex}));

// A narrow mountain spur climbs one face and descends a different, steeper face.
const mountainVerts=[],mountainUV=[],mountainIds=[];
for(let i=0;i<=600;i++){
  const c=residentRoutes.mountainPoint(i/600),next=residentRoutes.mountainPoint(Math.min(1,(i+1)/600));
  const prev=residentRoutes.mountainPoint(Math.max(0,(i-1)/600)),direction=next.clone().sub(prev),side=new THREE.Vector3(-direction.z,0,direction.x).normalize();
  for(const s of [-1,1]){const v=c.clone().addScaledVector(side,s*.34);mountainVerts.push(v.x,groundHeight(v.x,v.z)+.075,v.z);mountainUV.push(i/30,(s+1)/2);}
  if(i<600){const a=i*2;mountainIds.push(a,a+2,a+1,a+1,a+2,a+3);}
}
const mountainGeo=new THREE.BufferGeometry();mountainGeo.setAttribute('position',new THREE.Float32BufferAttribute(mountainVerts,3));mountainGeo.setAttribute('uv',new THREE.Float32BufferAttribute(mountainUV,2));mountainGeo.setIndex(mountainIds);mountainGeo.computeVertexNormals();mesh(mountainGeo,mat(0xcdbb90,{side:THREE.DoubleSide,map:stoneTex}));

const fixed=new THREE.Group();scene.add(fixed);
// Rounded coastal granite.
for(let i=0;i<175;i++){let a=rnd()*Math.PI*2,r=25+rnd()*6,x=Math.cos(a)*r,z=Math.sin(a)*r,y=height(x,z);if(y<-.8||trailDistance(x,z)<1.8|| (z>22&&Math.abs(x-3)<3))continue;let m=mesh(new THREE.IcosahedronGeometry(1,1),stone,fixed);m.position.set(x,y+.05,z);m.scale.set(.3+rnd()*1.05,.25+rnd()*.9,.35+rnd()*.8);m.rotation.set(rnd(),rnd()*6,rnd())}

// Broad-leaf forest: branching trunks and small individual foliage clusters.
function foliageTexture(){const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');for(let i=0;i<1600;i++){const a=rnd()*Math.PI*2,r=Math.sqrt(rnd()),x=256+Math.cos(a)*r*218,y=255+Math.sin(a)*r*204;let patch=noise(x*.012,y*.012);if(patch<.32||r>.75&&rnd()>.66)continue;let green=105+rnd()*70+(1-y/512)*30;ctx.fillStyle=`rgb(${green*.7|0},${green+20|0},${green*.37|0})`;ctx.beginPath();ctx.ellipse(x,y,4+rnd()*10,2+rnd()*4,rnd()*6,0,Math.PI*2);ctx.fill();}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t}
const canopyTexture=foliageTexture();const canopyMats=[0xf4edce,0xddedcb,0xebf4d3,0xe8edb5,0xcadcb9].map(c=>mat(c,{map:canopyTexture,alphaTest:.4,side:THREE.DoubleSide,roughness:1,emissive:0x142409,emissiveIntensity:.22}));
const forestLeaves=[],forestTrunks=[];for(let i=0;i<220;i++){let x=(rnd()-.5)*51,z=(rnd()-.5)*49,h=height(x,z);if(h<1.6||h>18||trailDistance(x,z)<4.4||residentRoutes.mountainDistance(x,z)<2.5|| (z>6&&x>-21&&x<21)|| (Math.abs(x+2)<3&&z>3&&z<11))continue;let s=.65+rnd()*.65;forestTrunks.push({x,y:h,z,s});for(let j=0;j<7;j++){forestLeaves.push({x:x+(rnd()-.5)*s*2,y:h+1.7*s+rnd()*1.7*s,z:z+(rnd()-.5)*s*2,sx:s*(.55+rnd()*.5),sy:s*(.55+rnd()*.45),sz:s*(.55+rnd()*.5),m:i%5})}}
const dummy=new THREE.Object3D();function instanced(geometry,material,items,setup){let im=new THREE.InstancedMesh(geometry,material,items.length);items.forEach((it,i)=>{dummy.position.set(0,0,0);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);setup(it,dummy);dummy.updateMatrix();im.setMatrixAt(i,dummy.matrix)});im.castShadow=true;im.receiveShadow=true;scene.add(im);return im}
instanced(new THREE.CylinderGeometry(.1,.17,1,6),wood,forestTrunks,(o,d)=>{d.position.set(o.x,o.y+o.s,o.z);d.scale.set(o.s,o.s*2,o.s)});
for(let i=0;i<5;i++){let cards=[];for(let o of forestLeaves.filter(o=>o.m===i))for(let k=0;k<4;k++)cards.push({...o,k});instanced(new THREE.PlaneGeometry(2.8,2.5),canopyMats[i],cards,(o,d)=>{d.position.set(o.x,o.y,o.z);d.scale.set(o.sx,o.sy,1);d.rotation.y=o.x+o.k*Math.PI/3;d.rotation.x=o.k===3?-Math.PI/2:.13});}
// Irregular strata and broken outcrops catch the sunlight on the mountain faces.
for(let i=0;i<75;i++){let x=-4+(rnd()-.5)*19,z=-5+(rnd()-.5)*21,h=height(x,z);if(h<7||h>21||residentRoutes.mountainDistance(x,z)<1.1)continue;let geo=new THREE.IcosahedronGeometry(1,1);const a=geo.attributes.position;for(let k=0;k<a.count;k++){let s=.85+noise(a.getX(k)*4+i,a.getZ(k)*4)*.35;a.setXYZ(k,a.getX(k)*s,a.getY(k)*s,a.getZ(k)*s)}geo.computeVertexNormals();let m=mesh(geo,stone,fixed);m.position.set(x,h-.35,z);m.scale.set(.4+rnd()*.7,.55+rnd()*1.25,.4+rnd()*.7);m.rotation.set(rnd()*.3,rnd()*6,rnd()*.2)}

// Palm fronds have a central arch with many thin leaflets, rather than flat silhouettes.
function palm(x,z,s=1,angle=0){const g=new THREE.Group();fixed.add(g);g.position.set(x,height(x,z),z);g.rotation.y=angle;g.scale.setScalar(s);const h=5.8,bend=.8;for(let k=0;k<9;k++){let a=k/9,b=(k+1)/9;rod(g,[bend*a*a,h*a,0],[bend*b*b,h*b,0],.16*(1-a*.55),.16*(1-b*.55),wood)}const leafGeos=[];for(let j=0;j<9;j++){let a=j/9*Math.PI*2;const pts=[];for(let k=0;k<=15;k++){let t=k/15;pts.push(new THREE.Vector3(bend+Math.cos(a)*t*3,h+Math.sin(t*Math.PI)*.85-t*.85,Math.sin(a)*t*3))}const curve=new THREE.CatmullRomCurve3(pts);let stem=new THREE.TubeGeometry(curve,15,.023,3,false);leafGeos.push(stem);for(let k=1;k<15;k++){let t=k/15,p=pts[k],len=.7*Math.sin(t*Math.PI)*(.65+.35*(1-t));for(let sign of[-1,1]){const side=new THREE.Vector3(Math.cos(a+Math.PI/2)*sign,0,Math.sin(a+Math.PI/2)*sign);const tip=p.clone().addScaledVector(side,len).add(new THREE.Vector3(Math.cos(a)*.22,-.18,Math.sin(a)*.22));const middle=p.clone().add(new THREE.Vector3(Math.cos(a)*.22,.02,Math.sin(a)*.22));const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([...p,...middle,...tip],3));geo.computeVertexNormals();leafGeos.push(geo)}}}mesh(mergeGeometries(leafGeos.map(g=>{let q=g.index?g.toNonIndexed():g;if(q.attributes.uv)q.deleteAttribute('uv');return q})),leafMat,g);for(let i=0;i<4;i++)sphere(g,bend+(rnd()-.5)*.4,h-.2,(rnd()-.5)*.4,.18,.23,.18,wood)}
for(const [x,z,s,a]of[[-23,7,1.1,.4],[-21,13,1,2],[-17,20,.85,1],[22,9,1.15,2],[20,15,1,4],[16,20,1,3],[11,24,.8,1],[24,-3,1.2,3],[-22,-10,.95,1],[-17,-19,1,2],[8,-24,1,3],[-7,25,.8,3]]){const k=trailDistance(x,z)<2.2?(trailRadius-2.8)/radius(x,z):1;palm(x*k,z*k,s,a);}

// Boardwalk, rope rails, timber houses and individually laid thatch.
for(let i=0;i<30;i++){let z=24+i*.3;box(fixed,3,1.03,z,2.9,.15,.27,i%4?timber:wood)}for(let i=0;i<7;i++)for(let x of[1.65,4.35]){let z=24+i*1.42;rod(fixed,[x,-1,z],[x,2,z],.105,.09,wood);if(i<6)rod(fixed,[x,1.72,z],[x,1.72,z+1.42],.026,.026,timber)}
const thatch=[0xd49f48,0xe6bf67,0xdcb65c,0xb98d40].map(c=>mat(c));
function house(x,z,rotation=0,scale=1,open=false){const g=new THREE.Group();fixed.add(g);g.position.set(x,height(x,z),z);g.rotation.y=rotation;g.scale.setScalar(scale);box(g,0,.22,0,4.7,.22,4,timber);for(let x of[-2,2])for(let z of[-1.7,1.7])rod(g,[x,0,z],[x,3.1,z],.13,.1,wood);if(!open){for(let i=0;i<18;i++){let x=-1.9+i*.22;box(g,x,1.5,-1.7,.19,2.45,.12,timber);if(Math.abs(x)>.58)box(g,x,1.5,1.7,.19,2.45,.12,timber)}for(let i=0;i<15;i++){let z=-1.6+i*.22;box(g,-2,1.5,z,.12,2.45,.19,wood);box(g,2,1.5,z,.12,2.45,.19,wood)}box(g,0,1.4,1.63,1.06,2.4,.08,mat(0x2c332a));}
for(let side of[-1,1])for(let row=0;row<6;row++)for(let i=0;i<31;i++){let x=side*(row*.43+.12),z=-2.1+i*.14,yt=4.4-Math.abs(x)*.58;rod(g,[x,yt,z],[x+side*.7,yt-.45,z+(rnd()-.5)*.1],.06,.04,thatch[(row+i)%4],5)}rod(g,[0,4.45,-2.2],[0,4.45,2.2],.12,.12,wood);if(open){box(g,0,1.1,0,2.5,.13,1.2,wood);for(let x of[-1,1])for(let z of[-.4,.4])rod(g,[x,.3,z],[x,1.1,z],.09,.09,wood)}return g}
house(15,5,.15,1);house(-15,7,-.4,.85);house(14,-11,2.8,.8);const court=house(11,13,-.25,.8,true);
function labelTexture(text,small=''){const c=document.createElement('canvas');c.width=512;c.height=192;let ctx=c.getContext('2d');ctx.fillStyle='#bc9562';ctx.fillRect(0,0,512,192);for(let i=0;i<70;i++){ctx.strokeStyle=`rgba(72,47,23,${rnd()*.18})`;ctx.beginPath();ctx.moveTo(0,rnd()*192);ctx.lineTo(512,rnd()*192);ctx.stroke()}ctx.fillStyle='#352e22';ctx.textAlign='center';ctx.font='bold 56px "Meiryo UI",sans-serif';ctx.fillText(text,256,130);if(small){ctx.font='25px "Meiryo UI",sans-serif';ctx.fillText(small,256,47);ctx.strokeStyle='#884b38';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(85,41);ctx.lineTo(427,50);ctx.stroke()}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
let sign=mesh(new THREE.PlaneGeometry(3.4,1.28),mat(0xffffff,{map:labelTexture('さいばんしょ','けっこんしきじょう'),side:THREE.DoubleSide}),court);sign.position.set(0,2.8,1.95);
// Pineapple terraces, with individual fruit scales and sharp leaf crowns.
function pineappleTexture(){const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');ctx.fillStyle='#82602f';ctx.fillRect(0,0,512,512);for(let r=-1;r<13;r++)for(let col=-1;col<13;col++){let x=col*48+(r%2)*24,y=r*44;let gradient=ctx.createLinearGradient(x-20,y-20,x+20,y+20);gradient.addColorStop(0,'#dfbd58');gradient.addColorStop(.5,'#b8953c');gradient.addColorStop(1,'#897c37');ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(x,y-24);ctx.lineTo(x+23,y);ctx.lineTo(x,y+24);ctx.lineTo(x-23,y);ctx.closePath();ctx.fill();ctx.strokeStyle='#786532';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#d8bc5f';ctx.beginPath();ctx.ellipse(x-2,y-3,6,8,.4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#75633b';ctx.fillRect(x+1,y+1,3,4)}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
const pineappleMap=pineappleTexture();const fruitMat=mat(0xffe57b,{map:pineappleMap,bumpMap:pineappleMap,bumpScale:.018}),leafPine=mat(0x549736,{side:THREE.DoubleSide}),soil=mat(0x725f42,{map:stoneTex});
function pineapple(x,z,s=1){let y=height(x,z);sphere(fixed,x,y+.43*s,z,.16*s,.26*s,.16*s,fruitMat,10);for(let j=0;j<8;j++){let a=j*Math.PI/4;let geo=new THREE.BufferGeometry(),dx=Math.cos(a),dz=Math.sin(a);geo.setAttribute('position',new THREE.Float32BufferAttribute([x,y+.08,z,x+dx*.07*s-dz*.06*s,y+.24*s,z+dz*.07*s+dx*.06*s,x+dx*.7*s,y+.38*s,z+dz*.7*s,x,y+.08,z,x+dx*.7*s,y+.38*s,z+dz*.7*s,x+dx*.07*s+dz*.06*s,y+.24*s,z+dz*.07*s-dx*.06*s],3));geo.computeVertexNormals();mesh(geo,leafPine,fixed);rod(fixed,[x,y+.63*s,z],[x+dx*.16*s,y+.96*s,z+dz*.16*s],.035*s,.005,leafPine,3)}}
for(let r=0;r<5;r++)for(let c=0;c<9;c++){let x=-10+c*.95,z=12+r*1.04;pineapple(x,z,.85+rnd()*.2)}
// Cave opening is a recessed arch, framed by rough boulders.
const cave=new THREE.Group();fixed.add(cave);let caveY=height(-2,6);cave.position.set(-2,caveY-.35,6);const caveDark=mat(0x0c1d18);const arch=new THREE.Shape();arch.moveTo(-1.5,0);arch.lineTo(-1.5,1.7);arch.absarc(0,1.7,1.5,Math.PI,0,true);arch.lineTo(1.5,0);arch.closePath();let opening=mesh(new THREE.ShapeGeometry(arch),caveDark,cave);opening.position.z=.1;for(let i=0;i<11;i++){let a=i/10*Math.PI;let m=mesh(new THREE.IcosahedronGeometry(1,1),stone,cave);m.position.set(Math.cos(a)*1.8,1.55+Math.sin(a)*1.8,.26);m.scale.set(.63,.65,.75);m.rotation.set(rnd(),rnd(),rnd())}for(let x of[-1.9,1.9])sphere(cave,x,.6,.25,.62,.95,.7,stone);box(cave,0,.06,.5,3.5,.12,2,stone);

// Grasses and wildflowers use merged geometry so the forest stays lightweight.
const grassV=[],flowerItems=[];for(let i=0;i<6500;i++){let x=(rnd()-.5)*53,z=(rnd()-.5)*53,h=height(x,z);if(h<1.25||h>15||trailDistance(x,z)<1.05||residentRoutes.mountainDistance(x,z)<.55||(z>10&&x>-12&&x<14)||Math.hypot(x-15,z-5)<3)continue;let a=rnd()*6,w=.035,l=.15+rnd()*.27;grassV.push(x-w,h,z,x+w,h,z,x+Math.sin(a)*.12,h+l,z+Math.cos(a)*.12);if(i%8===0)flowerItems.push({x,y:h+.24,z,s:.06+rnd()*.06})}let gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(grassV,3));gg.computeVertexNormals();mesh(gg,grassMat,fixed);instanced(new THREE.IcosahedronGeometry(1,0),mat(0xffd05e),flowerItems,(o,d)=>{d.position.set(o.x,o.y,o.z);d.scale.setScalar(o.s)});

// Flower beds line the village clearing without hiding the walking route.
const petals=[];
for(let i=0;i<5;i++){const a=i*Math.PI*2/5;let geo=new THREE.SphereGeometry(1,8,5);geo.scale(.13,.055,.23);geo.rotateY(a);geo.translate(Math.sin(a)*.16,0,Math.cos(a)*.16);petals.push(geo);}
const bloomGeometry=mergeGeometries(petals,false),bloomCenters=[];
const bloomColors=[0xff668c,0xffbd36,0xbb80ef,0xff7c47];
for(let color=0;color<4;color++){
  const items=[];
  for(let i=0;i<180;i++){
    const beds=[[-12,18],[6,18],[13,8],[-13,10],[6,7],[15,17]],bed=beds[(i+color)%beds.length];
    let angle=rnd()*Math.PI*2,r=Math.sqrt(rnd())*2.4,x=bed[0]+Math.cos(angle)*r,z=bed[1]+Math.sin(angle)*r;
    if(trailDistance(x,z)<1.2||height(x,z)<1)continue;
    const item={x,y:height(x,z)+.32+rnd()*.16,z,s:.75+rnd()*.6};items.push(item);bloomCenters.push(item);
  }
  instanced(bloomGeometry,mat(bloomColors[color],{roughness:.65,emissive:bloomColors[color],emissiveIntensity:.06}),items,(o,d)=>{d.position.set(o.x,o.y,o.z);d.scale.setScalar(o.s);d.rotation.y=o.x;});
}
instanced(new THREE.SphereGeometry(.085,8,5),mat(0xffe97c),bloomCenters,(o,d)=>{d.position.set(o.x,o.y+.035,o.z);d.scale.setScalar(o.s);});
instanced(new THREE.CylinderGeometry(.018,.024,1,5),leafPine,bloomCenters,(o,d)=>{const ground=height(o.x,o.z);d.position.set(o.x,(ground+o.y)/2,o.z);d.scale.set(1,o.y-ground,1);});
const flowerLeaf=new THREE.SphereGeometry(1,8,4);flowerLeaf.scale(.075,.025,.2);flowerLeaf.rotateX(.4);
instanced(flowerLeaf,leafPine,bloomCenters,(o,d)=>{d.position.set(o.x+.06,o.y-.15,o.z);d.rotation.y=o.x;d.scale.setScalar(o.s);});

// Small lanterns keep the path and the residents readable after dark.
const lanternMaterial=mat(0xffdfa1,{emissive:0xffad47,emissiveIntensity:.05});
for(let i=0;i<24;i++){
  const t=i/24,p=trailPoint(t),n=trailPoint(t+.001).sub(p).normalize(),side=new THREE.Vector3(-n.z,0,n.x);
  p.addScaledVector(side,1.5);p.y=height(p.x,p.z);
  rod(fixed,[p.x,p.y,p.z],[p.x,p.y+.72,p.z],.045,.035,wood);
  sphere(fixed,p.x,p.y+.82,p.z,.15,.18,.15,lanternMaterial);
}
const villageLights=[];for(const [x,z] of [[9,16],[-8,15]]){const light=new THREE.PointLight(0xffb65e,0,19,2);light.position.set(x,height(x,z)+3,z);scene.add(light);villageLights.push(light);}

// Bake static props into material batches to reduce draw calls.
bake(fixed);

// Three fully modelled residents, with articulated legs and arms.
const skin=mat(0xe5b58a),dark=mat(0x182d29),cream=mat(0xe7dfc2),gold=mat(0xc4a04a,{metalness:.35,roughness:.5}),pink=mat(0xf070a0),yellow=mat(0xffcb38),metal=mat(0xd2d8cf,{metalness:.65,roughness:.33}),black=mat(0x102e39,{metalness:.3,roughness:.25}),cyan=mat(0x33bfc9,{emissive:0x169daf,emissiveIntensity:.8}),boot=mat(0x5b4530);
function resident(type){const g=new THREE.Group();scene.add(g);const body=new THREE.Group();g.add(body);let limbs=[];if(type==='mira'){sphere(body,0,.75,0,.32,.32,.22,metal);box(body,0,.8,.21,.32,.2,.035,black);for(let y of[.75,.82,.89])box(body,0,y,.235,.23,.015,.02,cyan);sphere(body,0,1.33,0,.43,.34,.31,metal,20);sphere(body,0,1.35,.24,.33,.22,.12,black,20);for(let x of[-.14,.14])sphere(body,x,1.37,.344,.052,.079,.021,cyan);sphere(body,0,1.25,.357,.045,.022,.012,cyan);for(let s of[-1,1]){rod(body,[s*.27,1.58,0],[s*.38,1.94,0],.025,.017,metal);sphere(body,s*.38,1.96,0,.065,.065,.065,cyan);let arm=new THREE.Group();arm.position.set(s*.3,.89,0);body.add(arm);rod(arm,[0,0,0],[s*.2,.25,0],.065,.06,metal);sphere(arm,s*.21,.3,0,.09,.09,.09,black);limbs.push(arm);let leg=new THREE.Group();leg.position.set(s*.19,.47,0);body.add(leg);rod(leg,[0,0,0],[0,-.28,0],.07,.07,metal);sphere(leg,0,-.3,.055,.12,.15,.18,metal);limbs.push(leg)}sphere(body,.32,1.59,.2,.11,.07,.045,pink);sphere(body,.4,1.54,.2,.08,.1,.045,pink);
}else{const isCap=type==='captain',hair=isCap?dark:pink;for(let s of[-1,1]){let leg=new THREE.Group();leg.position.set(s*.115,.61,0);body.add(leg);rod(leg,[0,0,0],[0,-.46,0],.072,.066,isCap?boot:skin);sphere(leg,0,-.48,.055,.09,.085,.145,boot);limbs.push(leg)}let torso=mesh(new THREE.CylinderGeometry(.19,isCap?.22:.37,.52,16),isCap?cream:yellow,body);torso.position.y=.84;if(isCap){box(body,0,.95,.17,.07,.3,.05,dark);rod(body,[-.18,1.08,.13],[0,.94,.2],.03,.03,dark);rod(body,[.18,1.08,.13],[0,.94,.2],.03,.03,dark)}sphere(body,0,1.4,-.04,.33,.35,.28,hair,18);sphere(body,0,1.4,.11,.255,.285,.24,skin,20);for(let i=0;i<7;i++){let x=-.25+i*.082;sphere(body,x,1.62+Math.sin(i)*.035,.12,.095,.13,.19,hair)}for(let s of[-1,1]){sphere(body,s*.28,1.28,-.02,.095,isCap?.27:.4,.14,hair);sphere(body,s*.088,1.44,.334,.024,.036,.013,dark);let arm=new THREE.Group();body.add(arm);arm.position.set(s*.23,1.02,0);rod(arm,[0,0,0],[s*.05,-.33,.03],.065,.048,skin);sphere(arm,s*.05,-.36,.03,.055,.06,.055,skin);limbs.push(arm)}sphere(body,0,1.32,.351,.035,.015,.012,pink);if(isCap){let cap=mesh(new THREE.CylinderGeometry(.29,.33,.18,24),cream,body);cap.position.set(0,1.76,0);sphere(body,0,1.68,.16,.32,.038,.3,dark);sphere(body,0,1.77,.291,.057,.064,.012,gold)}else{sphere(body,.28,1.64,.1,.08,.11,.07,gold);for(let i=0;i<4;i++)rod(body,[.28,1.7,.1],[.21+i*.04,1.88,.1],.02,.005,leafPine,3)}}g.scale.setScalar(1.65);return{g,body,limbs,type}}
const people=[resident('captain'),resident('hiromine'),resident('mira')];
const peopleNames=['ペチ隊長','ヒロミーヌ','ミラ'];people.forEach((p,i)=>{let e=document.createElement('div');e.className='name';e.style.setProperty('--person-color',['#ffd46b','#ff88b4','#72e8ed'][i]);e.textContent=peopleNames[i];$('#labels').append(e);p.label=e});

// Tiny seabirds move across the sky, their wings articulated from code.
const birds=[];for(let i=0;i<6;i++){let g=new THREE.Group();scene.add(g);let b=mesh(new THREE.ConeGeometry(.1,.65,5),mat(0xe8e2cf),g);b.rotation.x=Math.PI/2;let wings=[];for(let s of[-1,1]){let w=mesh(new THREE.PlaneGeometry(.7,.2),mat(0xdad7c7,{side:THREE.DoubleSide}),g);w.position.x=s*.32;w.rotation.x=-Math.PI/2;wings.push(w)}birds.push({g,wings})}

let mode='orbit',auto=true,paused=false,timeOfDay='day',personTime=0,clock=0,transition=null,walkYaw=0,walkPitch=0,followIndex=-1;const keys=new Set();const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduced){controls.autoRotate=false;auto=false;paused=true}
const places={overview:{...overviewView,title:'風と、緑と、\nちいさな大騒ぎ。',desc:'どこにあるのか、だれも知らない。3人が暮らす島を、自由に巡ってみませんか。'},dock:{target:[3,1.5,26],pos:[12,7,38],title:'01 / はじまりの桟橋',desc:'波の音が聞こえてきそうな、小さな島の入口。海岸から一歩ずつ奥へ。'},field:{target:[-6,2.5,14],pos:[2,7,23],title:'02 / パイナップル畑',desc:'ヒロミーヌのお気に入り。甘い香りの畑の向こうを、3人がおさんぽ中。'},cave:{target:[-2,caveY+1.4,6],pos:[1,caveY+3,15],title:'03 / 山のひみつの洞窟',desc:'島の中心にある、岩に囲まれた避難場所。原作ではここにも大騒ぎが。'},court:{target:[11,height(11,13)+1.8,13],pos:[6,8,21],title:'04 / 森のさいばんしょ',desc:'花とヤシに囲まれた茅葺きの建物。看板の書き換えにもご注目。'},back:{target:[0,2,-23],pos:[-15,12,-38],title:'05 / 島の裏側\n海辺の遊歩道',desc:'山の裏側にも、海沿いの道が続きます。3人はこの道で島をぐるりと一周。「島を歩く」で、ここから探検できます。'},summit:{target:[residentRoutes.summit.x,residentRoutes.summit.y+.6,residentRoutes.summit.z],pos:[20,32,22],title:'06 / 中央峰\n山登りの寄り道',desc:'外周を巡った3人が、ときどき山頂へ。別の急斜面を下り、海沿いの道へ戻ります。「3人と歩く」で登山も追いかけられます。'}};
function story(title,desc){$('#place-title').textContent=title;$('#place-desc').textContent=desc}
function updateUI(){if(mode!=='follow')$('#follow').value='-1';if(mode!=='orbit')document.querySelectorAll('[data-place]').forEach(b=>b.setAttribute('aria-pressed','false'));$('#rotate').setAttribute('aria-pressed',auto);$('#rotate').textContent=auto?'Ⅱ 自動回転を止める':'↻ 360° 自動回転';$('#walk').setAttribute('aria-pressed',mode==='walk');$('#walk').textContent=mode==='walk'?'↗ 空から眺める':'⌖ 島を歩く';$('#pause').textContent=paused?'▶ 3人を動かす':'Ⅱ 3人を止める';$('#pause').setAttribute('aria-pressed',paused);$('#walk-pad').hidden=mode!=='walk';$('#help').textContent=mode==='walk'?'ドラッグで見回す · W A S D / 矢印で歩く · Esc で全景へ':'ドラッグで360°回転 · スクロールで近づく · 右ドラッグで移動';$('#mode').textContent=mode==='walk'?'ON FOOT':mode==='follow'?'FOLLOWING':'ISLAND EXPLORER';}
function go(name){const p=places[name];mode='orbit';followIndex=-1;controls.enabled=true;auto=name==='overview';controls.autoRotate=false;transition={start:performance.now(),from:camera.position.clone(),to:new THREE.Vector3(...p.pos),fromTarget:controls.target.clone(),toTarget:new THREE.Vector3(...p.target)};story(p.title,p.desc);updateUI();document.querySelectorAll('[data-place]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.place===name));}
document.querySelectorAll('[data-place]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.place)));
$('#rotate').addEventListener('click',()=>{if(mode!=='orbit'){go('overview');auto=true}else auto=!auto;controls.autoRotate=auto;updateUI()});
$('#pause').addEventListener('click',()=>{paused=!paused;updateUI()});
$('#walk').addEventListener('click',()=>{if(mode==='walk'){go('overview');return}transition=null;mode='walk';followIndex=-1;auto=false;controls.autoRotate=false;controls.enabled=false;const fromBack=$('[data-place="back"]').getAttribute('aria-pressed')==='true',start=fromBack?trailPoint(.5):new THREE.Vector3(3,height(3,25),25);camera.position.set(start.x,height(start.x,start.z)+1.65,start.z);canvas.focus();walkYaw=fromBack?Math.PI:0;walkPitch=-.025;story('島の道を、\nあなたの足で。','ドラッグして見回しながら、移動キーで進めます。山の急斜面と海には進めません。');updateUI()});

const fireworks=createFireworks(scene,camera,{reducedMotion:reduced});
function setTimeOfDay(value){
  if(!['day','sunset','night'].includes(value))return;
  timeOfDay=value;const night=value==='night',sunset=value==='sunset';
  atmosphere.set(value);
  document.querySelectorAll('button[data-time]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.time===value)));
  document.body.dataset.time=value;canvas.dataset.timeOfDay=value;
  sun.color.set(night?0xacc8ff:sunset?0xffaf62:0xfff1cc);sun.intensity=night?1.8:sunset?2.65:3.1;
  hemi.color.set(night?0x8bacf0:sunset?0xffca9f:0xc2edff);hemi.groundColor.set(night?0x243c65:sunset?0xa27851:0x89a64e);hemi.intensity=night?1.3:sunset?1.9:2.7;
  renderer.toneMappingExposure=night?1.12:sunset?1.08:1.12;
  scene.fog.color.set(night?0x17233f:sunset?0xf99b5b:0x8adce9);
  const v=night?new THREE.Vector3(-.45,.65,-.65).normalize():sunset?new THREE.Vector3(-.6,.16,-.8).normalize():sunVector;
  sun.position.copy(v).multiplyScalar(70);waterUniforms.uSun.value=v;waterUniforms.uWarm.value=sunset?1:0;waterUniforms.uNight.value=night?1:0;
  lanternMaterial.emissiveIntensity=night?2.8:sunset?.8:.05;villageLights.forEach(l=>l.intensity=night?32:sunset?8:0);
  birds.forEach(b=>b.g.visible=!night);
  fireworks.setNight(night);$('#fireworks').hidden=!night;updateFireworksButton();
}
function updateFireworksButton(){const b=$('#fireworks');b.setAttribute('aria-pressed',String(fireworks.active));b.textContent=fireworks.active?'✦ 花火を止める':'✦ 花火を上げる';}
document.querySelectorAll('button[data-time]').forEach(b=>b.addEventListener('click',()=>setTimeOfDay(b.dataset.time)));
$('#fireworks').addEventListener('click',()=>{fireworks.setActive(!fireworks.active);updateFireworksButton();});
setTimeOfDay('day');

$('#follow').addEventListener('change',e=>{let i=Number(e.target.value);if(i<0){go('overview');return}transition=null;followPrevious=null;followGroundLift=0;followIndex=i;mode='follow';auto=false;controls.enabled=true;controls.autoRotate=false;let p=people[i].g.position;controls.target.copy(p).add(new THREE.Vector3(0,1,0));camera.position.copy(p).add(new THREE.Vector3(5,3,7));story(peopleNames[i]+'と、\n島のおさんぽ。','一緒に歩く視点です。ドラッグで角度を変え、スクロールで距離を調整できます。');updateUI()});
controls.addEventListener('start',()=>{transition=null;if(mode==='follow')followGroundLift=0;if(mode==='orbit'){auto=false;controls.autoRotate=false;updateUI()}});
function walkStep(forward,side,dt){const v=new THREE.Vector3(-Math.sin(walkYaw)*forward+Math.cos(walkYaw)*side,0,-Math.cos(walkYaw)*forward-Math.sin(walkYaw)*side).normalize().multiplyScalar(dt*3.3),nx=camera.position.x+v.x,nz=camera.position.z+v.z,h=height(nx,nz);const blocked=[[15,5,.15,1],[-15,7,-.4,.85],[14,-11,2.8,.8]].some(([x,z,a,s])=>{let dx=nx-x,dz=nz-z;return Math.abs(Math.cos(a)*dx-Math.sin(a)*dz)<2.25*s&&Math.abs(Math.sin(a)*dx+Math.cos(a)*dz)<1.95*s});if(!blocked&&h>.25&&Math.abs(h-height(camera.position.x,camera.position.z))<.28){camera.position.x=nx;camera.position.z=nz;camera.position.y=mix(camera.position.y,h+1.65,Math.min(1,dt*12))}}
function keyStep(code,dt){walkStep(['KeyW','ArrowUp'].includes(code)?1:['KeyS','ArrowDown'].includes(code)?-1:0,['KeyD','ArrowRight'].includes(code)?1:['KeyA','ArrowLeft'].includes(code)?-1:0,dt)}
const allowedKeys=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];window.addEventListener('keydown',e=>{if(e.target.matches('input,select'))return;if(mode==='walk'&&allowedKeys.includes(e.code)){keys.add(e.code);if(!e.repeat)keyStep(e.code,.045);e.preventDefault()}if(e.code==='Escape')go('overview')});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
let pointer=null;canvas.addEventListener('pointerdown',e=>{if(mode==='walk'){pointer={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId)}});canvas.addEventListener('pointermove',e=>{if(!pointer||mode!=='walk')return;walkYaw-=(e.clientX-pointer.x)*.005;walkPitch=clamp(walkPitch-(e.clientY-pointer.y)*.004,-1,1);pointer.x=e.clientX;pointer.y=e.clientY});canvas.addEventListener('pointerup',()=>pointer=null);canvas.addEventListener('pointercancel',()=>pointer=null);
document.querySelectorAll('[data-key]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);keyStep(b.dataset.key,.045)});b.addEventListener('click',e=>{if(e.detail===0)keyStep(b.dataset.key,.12)});for(let ev of['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>keys.delete(b.dataset.key))});
function resize(){let w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}window.addEventListener('resize',resize);resize();
const ray=new THREE.Raycaster(),vproj=new THREE.Vector3();let previous=performance.now(),labelTick=0,followPrevious=null,followGroundLift=0;
function frame(now){requestAnimationFrame(frame);let elapsed=now-previous,dt=Math.min(elapsed/1000,.05);previous=now;clock+=dt;if(!paused)personTime+=dt;waterUniforms.uTime.value=clock;fireworks.update(dt);
people.forEach((p,i)=>{const motion=residentRoutes.sample(i,personTime);p.motion=motion;p.g.position.copy(motion.point);const yaw=Math.atan2(motion.tangent.x,motion.tangent.z),turn=Math.atan2(Math.sin(yaw-p.g.rotation.y),Math.cos(yaw-p.g.rotation.y));p.g.rotation.y+=turn*Math.min(1,dt*12);p.body.position.y=paused?0:Math.abs(Math.sin(personTime*5+i))*.045;const grade=motion.tangent.y/Math.max(.15,Math.hypot(motion.tangent.x,motion.tangent.z));p.body.rotation.x=motion.route==='mountain'?clamp(grade*.15,-.14,.22):0;p.limbs.forEach((l,j)=>{if(p.type==='mira')l.rotation.z=Math.sin(personTime*5+j)*.22;else l.rotation.x=Math.sin(personTime*5+(j%2)*Math.PI)*.32})});
if(transition){let u=clamp((now-transition.start)/1800,0,1),t=u*u*(3-2*u);camera.position.lerpVectors(transition.from,transition.to,t);controls.target.lerpVectors(transition.fromTarget,transition.toTarget,t);if(u===1){transition=null;controls.autoRotate=auto}}
if(mode==='follow'){camera.position.y-=followGroundLift;followGroundLift=0;let p=people[followIndex].g.position;if(followPrevious)camera.position.add(p.clone().sub(followPrevious));controls.target.copy(p).add(new THREE.Vector3(0,1,0));followPrevious=p.clone()}else{followPrevious=null;followGroundLift=0;}
if(mode==='walk'){let forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),side=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);walkStep(forward,side,dt);camera.rotation.order='YXZ';camera.rotation.y=walkYaw;camera.rotation.x=walkPitch;}else{controls.update(dt);const minimumHeight=height(camera.position.x,camera.position.z)+.8;if(mode==='follow'){followGroundLift=Math.max(0,minimumHeight-camera.position.y);camera.position.y+=followGroundLift;camera.lookAt(controls.target);}else camera.position.y=Math.max(camera.position.y,minimumHeight);}
birds.forEach((b,i)=>{let a=clock*.07+i;b.g.position.set(Math.sin(a)*35,25+Math.sin(a*.7)*3,Math.cos(a)*30);b.g.rotation.y=a+Math.PI/2;b.wings.forEach((w,j)=>w.rotation.z=Math.sin(clock*4+i)*(j?1:-1)*.22)});
labelTick++;if(labelTick%8===0){people.forEach((p,i)=>{const phase=p.motion.phase,status=phase==='ascending'?' · 山登り':phase==='descending'?' · 下山':'';if(p.label.textContent!==peopleNames[i]+status)p.label.textContent=peopleNames[i]+status;p.label.dataset.route=p.motion.route;p.label.dataset.phase=phase;p.label.dataset.altitude=p.g.position.y.toFixed(2);vproj.copy(p.g.position).add(new THREE.Vector3(0,3.65,0));const dist=camera.position.distanceTo(vproj);ray.set(camera.position,vproj.clone().sub(camera.position).normalize());let hits=ray.intersectObject(terrain);let visible=dist<100&&(!hits.length||hits[0].distance>dist-.4);vproj.project(camera);p.label.hidden=!visible||vproj.z>1||vproj.z<0;p.label.style.transform='translate(-50%,-50%) translate('+((vproj.x*.5+.5)*innerWidth)+'px,'+((-vproj.y*.5+.5)*innerHeight)+'px)';});$('#bearing').textContent=String(Math.round((Math.atan2(camera.position.x,camera.position.z)*180/Math.PI+360)%360)).padStart(3,'0')+'°';}
if(labelTick%8===0){canvas.dataset.camera=camera.position.toArray().map(v=>v.toFixed(3)).join(',');canvas.dataset.mode=mode;canvas.dataset.sceneTime=personTime.toFixed(3);canvas.dataset.frameMs=elapsed.toFixed(1);canvas.dataset.fireworkParticles=String(fireworks.particleCount);}
renderer.render(scene,camera);}
updateUI();renderer.render(scene,camera);requestAnimationFrame(frame);$('#loading').classList.add('done');setTimeout(()=>$('#loading').hidden=true,650);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('#loading').hidden=false;$('#loading').classList.remove('done');$('#loading').innerHTML='<h2>3D表示が一時停止しました</h2><p>ページを再読み込みすると再開できます。</p>'});
