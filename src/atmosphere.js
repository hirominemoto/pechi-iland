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

// Fixed-capacity particle buffers: rockets, expanding sparks and fading trails.
export function createFireworks(scene,camera,{reducedMotion=false}={}) {
  const capacity=4200,positions=new Float32Array(capacity*3),colors=new Float32Array(capacity*3),alpha=new Float32Array(capacity),sizes=new Float32Array(capacity);
  const geometry=new THREE.BufferGeometry();
  for(const [name,data,size] of [['position',positions,3],['color',colors,3],['aAlpha',alpha,1],['aSize',sizes,1]])geometry.setAttribute(name,new THREE.BufferAttribute(data,size).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0,0);
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec3 color;attribute float aAlpha,aSize;varying vec3 vColor;varying float vAlpha;void main(){vColor=color;vAlpha=aAlpha;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(aSize*680./max(1.,-p.z),1.,24.);}`,
    fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float glow=exp(-d*d*15.);vec3 color=mix(vColor*1.5,vec3(1.),pow(glow,6.)*.45);gl_FragColor=vec4(color,vAlpha*glow);#include <colorspace_fragment>}`.replace(';#include',';\n#include')
  });
  const cloud=new THREE.Points(geometry,material);cloud.frustumCulled=false;cloud.visible=false;scene.add(cloud);
  const palette=[0xffcc65,0xff5c9d,0x67e5ff,0xb88aff,0xff855b].map(c=>new THREE.Color(c));
  const particles=[],rockets=[];
  let enabled=false,active=false,timer=0,sequence=0;
  const random=()=>Math.random();
  function burst(center,color) {
    for(let i=0;i<150;i++){
      const y=1-2*(i+.5)/150,a=i*2.399963,r=Math.sqrt(1-y*y),speed=5+random()*4;
      const velocity=new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r).multiplyScalar(speed);
      particles.push({p:center.clone(),v:velocity,tail:[center.clone(),center.clone(),center.clone()],age:0,life:2.5+random()*1.2,color});
    }
  }
  function launch() {
    // Launch on the far shore relative to the visitor, keeping the island in view.
    let angle=Math.atan2(camera.position.x,camera.position.z)+Math.PI;
    angle+=[-.6,.42,0,.76,-.35][sequence%5];
    const radius=36+(sequence%3)*3,top=31+(sequence%3)*5;
    const p=new THREE.Vector3(Math.sin(angle)*radius,2,Math.cos(angle)*radius);
    rockets.push({p,top,age:0,color:palette[sequence++%palette.length]});
  }
  return {
    setNight(value) {
      enabled=value;active=value&&!reducedMotion;timer=.15;sequence=0;
      particles.length=rockets.length=0;geometry.setDrawRange(0,0);cloud.visible=value;
    },
    setActive(value){active=value;timer=Math.min(timer,.25);},
    get active(){return active;},
    update(dt){
      if(!enabled||!active)return;
      timer-=dt;if(timer<=0){launch();timer=1.6;}
      for(let i=rockets.length-1;i>=0;i--){let r=rockets[i];r.age+=dt;r.p.y+=dt*23;if(r.p.y>=r.top){burst(r.p,r.color);rockets.splice(i,1);}}
      for(let i=particles.length-1;i>=0;i--){let p=particles[i];p.age+=dt;if(p.age>p.life){particles.splice(i,1);continue;}p.tail[2].copy(p.tail[1]);p.tail[1].copy(p.tail[0]);p.tail[0].copy(p.p);p.v.multiplyScalar(Math.exp(-dt*.42));p.v.y-=dt*1.4;p.p.addScaledVector(p.v,dt);}
      let count=0;
      function point(p,color,opacity,size){if(count>=capacity)return;const j=count*3;positions[j]=p.x;positions[j+1]=p.y;positions[j+2]=p.z;colors[j]=color.r;colors[j+1]=color.g;colors[j+2]=color.b;alpha[count]=opacity;sizes[count]=size;count++;}
      for(const r of rockets)for(let i=0;i<12;i++)point({x:r.p.x,y:r.p.y-i*.25,z:r.p.z},r.color,1-i/12,.9-i*.04);
      for(const p of particles){const fade=Math.min(1,(p.life-p.age)/1.8);point(p.p,p.color,fade,1.5);for(let i=0;i<3;i++)point(p.tail[i],p.color,fade*(.65-i*.15),1.1-i*.16);}
      geometry.setDrawRange(0,count);for(const attribute of Object.values(geometry.attributes))attribute.needsUpdate=true;
    },
    get particleCount(){return geometry.drawRange.count;}
  };
}
