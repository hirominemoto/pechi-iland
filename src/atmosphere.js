import * as THREE from 'three';

// A painted atmosphere in linear color space, with a world-space sun / moon.
export function createAtmosphere(scene) {
  const uniforms = {
    zenith: { value: new THREE.Color('#188de8') },
    horizon: { value: new THREE.Color('#9ee6f6') },
    orbColor: { value: new THREE.Color('#fff5c9') },
    orbDirection: { value: new THREE.Vector3(-.45,.75,.5).normalize() },
    night: { value: 0 }
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(650,32,16), new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 direction;uniform vec3 zenith,horizon,orbColor,orbDirection;uniform float night;
      void main(){vec3 d=normalize(direction);float h=pow(max(d.y,0.),.48);
      vec3 color=mix(horizon,zenith,smoothstep(0.,.8,h));
      float alignment=max(dot(d,normalize(orbDirection)),0.);
      color+=orbColor*pow(alignment,28.)*(1.-night)*.22;
      float disk=smoothstep(.99955,.99972,alignment);
      color=mix(color,orbColor,disk);
      gl_FragColor=vec4(color,1.);
      #include <colorspace_fragment>
      }
    `
  }));
  dome.frustumCulled=false;
  dome.renderOrder=-10;
  scene.add(dome);
  const starsGeometry=new THREE.BufferGeometry(), points=[];
  let seed=771;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<1000;i++){
    const a=random()*Math.PI*2,y=.07+random()*.92,r=Math.sqrt(1-y*y);
    points.push(Math.cos(a)*r*560,y*560,Math.sin(a)*r*560);
  }
  starsGeometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  const stars=new THREE.Points(starsGeometry,new THREE.PointsMaterial({color:0xd6e7ff,size:1.6,sizeAttenuation:false,transparent:true,opacity:.9,depthWrite:false,toneMapped:false}));
  stars.visible=false;scene.add(stars);
  return {
    set(mode) {
      const colors=mode==='night'?['#071329','#26396a','#fff1cd']:mode==='sunset'?['#e8663f','#ffb65a','#fff4bf']:['#188de8','#9ee6f6','#fff5c9'];
      uniforms.zenith.value.set(colors[0]);uniforms.horizon.value.set(colors[1]);uniforms.orbColor.value.set(colors[2]);
      uniforms.night.value=mode==='night'?1:0;stars.visible=mode==='night';
      uniforms.orbDirection.value.set(...(mode==='night'?[-.6,.14,-.8]:mode==='sunset'?[-.6,.09,-.8]:[-.45,.75,.5])).normalize();
    }
  };
}

// Small sharp spark heads and one-pixel trails; no bloom pass or wide glow sprite.
export function createFireworks(scene,camera,{reducedMotion=false}={}) {
  const capacity=640,trailCapacity=capacity*16;
  function buffer(count){
    const geometry=new THREE.BufferGeometry();
    for(const [name,size] of [['position',3],['color',3],['aAlpha',1],['aSize',1]])
      geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(count*size),size).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0,0);return geometry;
  }
  const geometry=buffer(capacity),trailGeometry=buffer(trailCapacity);
  const vertexShader=`attribute vec3 color;attribute float aAlpha,aSize;
    varying vec3 vColor;varying float vAlpha;
    void main(){vColor=color;vAlpha=aAlpha;vec4 p=modelViewMatrix*vec4(position,1.);
    gl_Position=projectionMatrix*p;gl_PointSize=clamp(aSize*420./max(1.,-p.z),1.05,2.4);}`;
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.NormalBlending,
    vertexShader,
    fragmentShader:`varying vec3 vColor;varying float vAlpha;
      void main(){float d=length(gl_PointCoord-.5);if(d>.49)discard;
      float edge=1.-smoothstep(.33,.49,d);
      float core=1.-smoothstep(.035,.19,d);
      gl_FragColor=vec4(mix(vColor,vec3(1.),core*.45),vAlpha*edge);
      #include <colorspace_fragment>
      }`
  });
  const trailMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.NormalBlending,
    vertexShader,
    fragmentShader:`varying vec3 vColor;varying float vAlpha;
      void main(){gl_FragColor=vec4(vColor,vAlpha);
      #include <colorspace_fragment>
      }`
  });
  const cloud=new THREE.Points(geometry,material),trails=new THREE.LineSegments(trailGeometry,trailMaterial);
  cloud.frustumCulled=trails.frustumCulled=false;cloud.visible=trails.visible=false;
  // Draw the faint tail first, then the crisp head.
  trails.renderOrder=1;cloud.renderOrder=2;scene.add(cloud,trails);
  const palette=[0xffcf28,0xff59bc,0x48ddff,0xc878ff,0xff5757].map(c=>new THREE.Color(c).multiplyScalar(1.25));
  const white=new THREE.Color(0xfffaf2),trailColor=new THREE.Color();
  // Color has its own random stream so it cannot alter the existing spark trajectories.
  let colorSeed=Date.now()>>>0,colorOrder=[];
  function colorRandom(){colorSeed=(colorSeed*1664525+1013904223)>>>0;return colorSeed/4294967296;}
  function nextColor(){
    if(!colorOrder.length){colorOrder=palette.map((_,i)=>i);for(let i=colorOrder.length-1;i>0;i--){const j=Math.floor(colorRandom()*(i+1));[colorOrder[i],colorOrder[j]]=[colorOrder[j],colorOrder[i]];}}
    return palette[colorOrder.pop()];
  }
  const particles=[],rockets=[];
  let enabled=false,active=false,timer=0,sequence=0;
  const sample=new THREE.Vector3(),tailSample=new THREE.Vector3();
  const random=()=>Math.random();
  function burst(center,shell){
    const base=nextColor();
    // A hollow outer shell, open sectors and a few inner sparks give the shape breathing room.
    for(let i=0;i<112;i++){
      const y=1-2*(i+.5)/112,a=i*2.399963,r=Math.sqrt(1-y*y);
      const density=.75+.2*Math.sin(a*3+shell);
      if(random()>density)continue;
      const direction=new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r);
      const outer=random()>.16,speed=outer?7.2+random()*1.6:3.7+random()*1.3;
      const color=base.clone();
      particles.push({origin:center.clone(),velocity:direction.multiplyScalar(speed),age:0,life:2.7+random()*.6,color,size:outer?.48:.35,trail:outer?.46:.25});
    }
  }
  function position(p,t,out){
    // Drag slows the expansion; gravity bends each tail downward before it fades.
    const travel=(1-Math.exp(-.3*t))/.3;
    out.copy(p.origin).addScaledVector(p.velocity,travel);out.y-=1.1*t*t;return out;
  }
  function launch(){
    let angle=Math.atan2(camera.position.x,camera.position.z)+Math.PI;
    angle+=[-.55,.48,-.1,.67,-.35][sequence%5];
    const radius=38+(sequence%3)*2,top=31+(sequence%3)*2.5;
    rockets.push({p:new THREE.Vector3(Math.sin(angle)*radius,2,Math.cos(angle)*radius),top,shell:sequence++});
  }
  function write(geo,index,p,color,opacity,size){
    const j=index*3,attributes=geo.attributes;
    const xyz=attributes.position.array,rgb=attributes.color.array;
    xyz[j]=p.x;xyz[j+1]=p.y;xyz[j+2]=p.z;rgb[j]=color.r;rgb[j+1]=color.g;rgb[j+2]=color.b;
    attributes.aAlpha.array[index]=opacity;attributes.aSize.array[index]=size;
  }
  return {
    setNight(value){
      enabled=value;active=value&&!reducedMotion;timer=.15;sequence=0;
      particles.length=rockets.length=colorOrder.length=0;geometry.setDrawRange(0,0);trailGeometry.setDrawRange(0,0);
      cloud.visible=trails.visible=value;
    },
    setActive(value){active=value;timer=Math.min(timer,.25);},
    get active(){return active;},
    update(dt){
      if(!enabled||!active)return;
      timer-=dt;if(timer<=0){launch();timer=2.65;}
      for(let i=rockets.length-1;i>=0;i--){const r=rockets[i];r.p.y+=dt*23;if(r.p.y>=r.top){burst(r.p,r.shell);rockets.splice(i,1);}}
      for(let i=particles.length-1;i>=0;i--){particles[i].age+=dt;if(particles[i].age>particles[i].life)particles.splice(i,1);}
      let count=0,lineCount=0;
      const rocketColor=white;
      for(const r of rockets){
        if(count<capacity)write(geometry,count++,r.p,rocketColor,.95,.4);
        if(lineCount+2<=trailCapacity){write(trailGeometry,lineCount++,{x:r.p.x,y:r.p.y-2,z:r.p.z},palette[0],0,1);write(trailGeometry,lineCount++,r.p,rocketColor,.65,1);}
      }
      for(const p of particles){
        const age=p.age;if(age<.035)continue; // Avoid a large bright clump at the ignition point.
        const fade=Math.min(1,(p.life-age)/1.05);
        position(p,age,sample);
        if(count<capacity)write(geometry,count++,sample,p.color,fade*.96,p.size);
        const start=Math.max(0,age-p.trail),segments=8;
        for(let k=0;k<segments&&lineCount+2<=trailCapacity;k++){
          const u=k/segments,v=(k+1)/segments;
          const timeU=start+(age-start)*u,timeV=start+(age-start)*v;
          position(p,timeU,tailSample);trailColor.copy(white).lerp(p.color,Math.min(1,timeU/.22));write(trailGeometry,lineCount++,tailSample,trailColor,fade*Math.pow(u,1.2)*.72,1);
          position(p,timeV,tailSample);trailColor.copy(white).lerp(p.color,Math.min(1,timeV/.22));write(trailGeometry,lineCount++,tailSample,trailColor,fade*Math.pow(v,1.2)*.72,1);
        }
      }
      geometry.setDrawRange(0,count);trailGeometry.setDrawRange(0,lineCount);
      for(const geo of [geometry,trailGeometry])for(const attribute of Object.values(geo.attributes))attribute.needsUpdate=true;
    },
    get particleCount(){return geometry.drawRange.count;}
  };
}
