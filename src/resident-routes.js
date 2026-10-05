import * as THREE from 'three';

// The existing full coastal circuit stays intact. A separate closed spur climbs the peak.
export function createResidentRoutes({height,coastPoint}) {
  const coastDurations=[96,82,70],mountainDurations=[72,66,56];
  const junction=coastPoint(0),summit=new THREE.Vector3(-4.6,0,-5.4);
  const ascent=[[junction.x,junction.z],[2,20],[1,15],[.4,11.2],[-4.3,9.4],[-7.5,6.9],[-9,3.5],[-7.8,.4],[-6,-2.5],[summit.x,summit.z]];
  const descent=[[summit.x,summit.z],[-3.2,-2.8],[-1.2,.4],[1.5,3.8],[4.2,8.1],[6.7,13.2],[5.3,18.5],[2.2,22.5],[junction.x,junction.z]];
  function arcTable(waypoints){
    const curve=new THREE.CatmullRomCurve3(waypoints.map(([x,z])=>new THREE.Vector3(x,0,z)),false,'centripetal');
    const points=[],distances=[0];
    for(let i=0;i<=512;i++){
      const p=curve.getPoint(i/512);p.y=height(p.x,p.z)+.055;points.push(p);
      if(i)distances.push(distances.at(-1)+p.distanceTo(points[i-1]));
    }
    return {points,distances,length:distances.at(-1)};
  }
  const up=arcTable(ascent),down=arcTable(descent),mountainLength=up.length+down.length;
  const connectionOffset=junction.y-height(junction.x,junction.z)-.055;
  function arcPoint(table,distance){
    distance=THREE.MathUtils.clamp(distance,0,table.length);
    let low=0,high=table.distances.length-1;
    while(high-low>1){const middle=(low+high)>>1;if(table.distances[middle]<=distance)low=middle;else high=middle;}
    const fraction=(distance-table.distances[low])/(table.distances[high]-table.distances[low]||1);
    const p=table.points[low].clone().lerp(table.points[high],fraction);
    p.y=height(p.x,p.z)+.055;return p;
  }
  function mountainPoint(progress){
    const distance=THREE.MathUtils.clamp(progress,0,1)*mountainLength;
    const p=distance<=up.length?arcPoint(up,distance):arcPoint(down,distance-up.length);
    p.y+=connectionOffset*(1-THREE.MathUtils.clamp(Math.min(distance,mountainLength-distance)/2,0,1));return p;
  }
  const clearancePoints=Array.from({length:97},(_,i)=>mountainPoint(i/96));
  function mountainDistance(x,z){
    let best=Infinity;
    for(let i=1;i<clearancePoints.length;i++){
      const a=clearancePoints[i-1],b=clearancePoints[i],dx=b.x-a.x,dz=b.z-a.z;
      const t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
      best=Math.min(best,Math.hypot(x-a.x-dx*t,z-a.z-dz*t));
    }
    return best;
  }
  // Staggered starts let a visitor see one hike immediately while the others tour the coast.
  const offsets=[coastDurations[0]*.16,coastDurations[1]*.62,coastDurations[2]*2+mountainDurations[2]*.35];
  function stateAt(id,time){
    const coastalTime=coastDurations[id]*2,total=coastalTime+mountainDurations[id];
    const cycle=((time+offsets[id])%total+total)%total;
    if(cycle<coastalTime)return {point:coastPoint(cycle/coastDurations[id]),route:'coast',phase:'walking',progress:(cycle%coastDurations[id])/coastDurations[id]};
    const progress=(cycle-coastalTime)/mountainDurations[id];
    return {point:mountainPoint(progress),route:'mountain',phase:progress*mountainLength<up.length?'ascending':'descending',progress};
  }
  return {
    sample(id,time){const state=stateAt(id,time);state.tangent=stateAt(id,time+.035).point.sub(state.point).normalize();return state;},
    mountainPoint,mountainDistance,
    summit:mountainPoint(up.length/mountainLength),
    summitProgress:up.length/mountainLength,
    coastDurations,mountainDurations,offsets,
    cycleDuration(id){return coastDurations[id]*2+mountainDurations[id];}
  };
}
