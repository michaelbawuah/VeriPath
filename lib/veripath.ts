import boroughs from "./nyc-boundary.json";
import type { RoadEvidence, RoadMatch, RouteStep } from "./road-matching";
export type Coordinate = [number, number];
export type TravelMode = "bicycle" | "auto" | "pedestrian";
export type Place = { id: string; name: string; area: string; coordinate: Coordinate };
export type Crash = { id: string; date: string; coordinate: Coordinate; injured: number; killed: number; street: string; crossStreet?:string; roadMatch?:RoadMatch };
export type PlannedRoute = { id: string; seconds: number; meters: number; coordinates: Coordinate[]; crashes: Crash[]; steps?:RouteStep[]; roadEvidence?:RoadEvidence };
export type PlanResult = { routes: PlannedRoute[]; crashes: Crash[]; evidence: { available: boolean; truncated: boolean; fetchedAt: string; recordsInArea: number; window: string; radiusMeters: number; error?: string }; routingFetchedAt: string };
export const PLACES: Place[] = [
  { id: "washington", name: "Washington Square Park", area: "Greenwich Village", coordinate: [-73.997332,40.730823] },
  { id: "grandcentral", name: "Grand Central Terminal", area: "Midtown Manhattan", coordinate: [-73.977229,40.752726] },
  { id: "union", name: "Union Square", area: "Manhattan", coordinate: [-73.9904,40.7359] },
  { id: "bryant", name: "Bryant Park", area: "Midtown Manhattan", coordinate: [-73.9839,40.7536] },
  { id: "times", name: "Times Square", area: "Midtown Manhattan", coordinate: [-73.9855,40.7580] },
  { id: "columbus", name: "Columbus Circle", area: "Manhattan", coordinate: [-73.9819,40.7681] },
  { id: "battery", name: "Battery Park", area: "Lower Manhattan", coordinate: [-74.0167,40.7040] },
  { id: "cityhall", name: "City Hall Park", area: "Lower Manhattan", coordinate: [-74.0062,40.7127] },
  { id: "dumbo", name: "Brooklyn Bridge Park", area: "DUMBO, Brooklyn", coordinate: [-73.9943,40.7022] },
  { id: "prospect", name: "Grand Army Plaza", area: "Brooklyn", coordinate: [-73.9700,40.6740] },
  { id: "museum", name: "Brooklyn Museum", area: "Brooklyn", coordinate: [-73.9636,40.6712] },
  { id: "queens", name: "Gantry Plaza State Park", area: "Long Island City, Queens", coordinate: [-73.9580,40.7479] },
];
export const NYC_BOUNDS = { west: -74.26, east: -73.70, south:40.49,north:40.93 };
export function isPilotBoundingCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 && value.every(x=>typeof x === "number" && Number.isFinite(x)) && value[0]>=NYC_BOUNDS.west && value[0]<=NYC_BOUNDS.east && value[1]>=NYC_BOUNDS.south && value[1]<=NYC_BOUNDS.north;
}

function insideRing(point: Coordinate, ring: number[][]) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>point[1])!==(b[1]>point[1]) && point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
// Official NYC borough jurisdiction polygons, including water and bridge crossings.
export function isNYCCoordinate(value: unknown): value is Coordinate {
  if(!isPilotBoundingCoordinate(value))return false;
  return boroughs.some(borough=>borough.some(polygon=>insideRing(value,polygon[0])&&!polygon.slice(1).some(hole=>insideRing(value,hole))));
}

export function distanceMeters(a: Coordinate,b: Coordinate) {
  const lat=(a[1]+b[1])*Math.PI/360;
  return Math.hypot((a[0]-b[0])*111320*Math.cos(lat),(a[1]-b[1])*110540);
}
// Proximity screening in meters, not road assignment or a risk estimate.
export function pointToRouteMeters(point:Coordinate,line:Coordinate[]) {
  const sx=111320*Math.cos(point[1]*Math.PI/180), sy=110540;
  let minimum=Infinity;
  for(let i=1;i<line.length;i++) {
    const ax=(line[i-1][0]-point[0])*sx, ay=(line[i-1][1]-point[1])*sy;
    const bx=(line[i][0]-point[0])*sx, by=(line[i][1]-point[1])*sy;
    const dx=bx-ax,dy=by-ay,denominator=dx*dx+dy*dy;
    const t=denominator?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/denominator)):0;
    minimum=Math.min(minimum,Math.hypot(ax+t*dx,ay+t*dy));
  }
  return minimum;
}
export function filterDetour(routes:PlannedRoute[],minutes:number|null) {
  if(!routes.length)return [];
  const fastest=Math.min(...routes.map(r=>r.seconds));
  return routes.filter(r=>minutes===null || r.seconds <= fastest+minutes*60+0.001);
}

export function nearbyCrashes(crashes:Crash[],line:Coordinate[],radius:number) {
  if(line.length<2)return [];
  const sx=111320*Math.cos(line[0][1]*Math.PI/180),sy=110540,cell=radius*2;
  const buckets=new Map<string,Crash[]>();
  for(const crash of crashes){const key=`${Math.floor(crash.coordinate[0]*sx/cell)},${Math.floor(crash.coordinate[1]*sy/cell)}`;const bucket=buckets.get(key)||[];bucket.push(crash);buckets.set(key,bucket)}
  const found=new Map<string,Crash>();
  for(let i=1;i<line.length;i++){
    const a=line[i-1],b=line[i];
    const x0=Math.floor((Math.min(a[0],b[0])*sx-radius)/cell),x1=Math.floor((Math.max(a[0],b[0])*sx+radius)/cell);
    const y0=Math.floor((Math.min(a[1],b[1])*sy-radius)/cell),y1=Math.floor((Math.max(a[1],b[1])*sy+radius)/cell);
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(const crash of buckets.get(`${x},${y}`)||[]){
      if(!found.has(crash.id)&&pointToRouteMeters(crash.coordinate,[a,b])<=radius)found.set(crash.id,crash);
    }
  }
  return Array.from(found.values());
}
