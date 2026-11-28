// Unit smoke tests for independent v1.65 geodetic and radio helpers.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/app.js','utf8');
function pick(name){const start=src.indexOf('function '+name+'(');assert(start>=0,name);let p=src.indexOf('{',start),dep=1;let k=p+1;for(;dep&&k<src.length;k++){if(src[k]==='{')dep++;if(src[k]==='}')dep--;}return src.slice(start,k);}
const context={Math,document:{getElementById(){return null}},PRESET:[],navaidDirections:{},navaidDistanceUnits:{},getDecl:()=>11, toRad:n=>n*Math.PI/180, toDeg:n=>n*180/Math.PI,navaidIsVor:a=>a.type==='VOR', parseDistance:s=>s?Number(s):null};
vm.createContext(context);
for(const n of ['norm360','trueBearing','destinationFromMagnetic','greatCircleMeters','stationDirection','stationBearingFromInput','stationBearingForGPS'])vm.runInContext(pick(n),context);
const A={lat:50,lon:47};let B=context.destinationFromMagnetic(A,79,100);assert(Math.abs(context.greatCircleMeters(A,B)-100000)<5);assert(Math.abs(context.trueBearing(A,B)-90)<0.01);
const vor={id:'v',type:'VOR',lat:50,lon:47},ndb={id:'n',type:'NDB',lat:50,lon:47};
assert(context.stationBearingFromInput(vor,90)===101);
assert(context.stationBearingFromInput(ndb,90)===281);
context.navaidDirections.v='to';context.navaidDirections.n='mps';
assert(context.stationBearingFromInput(vor,270)===101);
assert(context.stationBearingFromInput(ndb,270)===281);
const gps={lat:49,lon:47};
for(const a of [vor,ndb]){const v=context.stationBearingForGPS(a,gps);assert(Math.abs(context.stationBearingFromInput(a,v)-context.norm360(context.trueBearing(a,gps)-11+11))<.01);}
console.log('OK: great circle + magnetic destination + VOR TO/FROM + NDB MPR/MPS');
