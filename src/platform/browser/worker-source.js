// Self-contained worker: serializable color tasks only (DOM objects can never
// cross the worker boundary). Injected via Blob URL by the browser platform,
// so no bundler or separate file serving is required.
export const WORKER_SOURCE = `
function luminance(c){var f=function(v){var s=v/255;return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4);};
return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]);}
function ratio(a,b){var l1=luminance(a),l2=luminance(b),hi=Math.max(l1,l2),lo=Math.min(l1,l2);
return (hi+0.05)/(lo+0.05);}
// Average image-data buckets (each item: {data:[r,g,b,...]}) into a
// representative background color. Used by the canvas rasterization path so
// pixel crunching never blocks the main thread.
function averageBucket(data){var r=0,g=0,b=0,n=Math.floor(data.length/3);
for(var i=0;i<data.length;i+=3){r+=data[i];g+=data[i+1];b+=data[i+2];}
return [Math.round(r/n),Math.round(g/n),Math.round(b/n)];}
self.onmessage=function(e){var d=e.data||{},items=d.items||[];var out=[];
for(var i=0;i<items.length;i++){var t=items[i];
if(t.type==='contrast'){var rr=t.fg&&t.bg?ratio(t.fg,t.bg):t.fgArr?ratio(t.fgArr,t.bgArr):null;
out.push(Object.assign({},t,rr==null?{}:{ratio:rr}));}
else if(t.type==='average'){out.push(Object.assign({},t,{color:averageBucket(t.data)}));}
else {out.push(t);}
}
self.postMessage({id:d.id,payload:out});};
`;

let blobURL = null;
export function getWorkerURL(URLCtor = typeof URL !== 'undefined' ? URL : null, BlobCtor = typeof Blob !== 'undefined' ? Blob : null) {
  if (blobURL || !URLCtor || !BlobCtor) return blobURL;
  blobURL = URLCtor.createObjectURL(new BlobCtor([WORKER_SOURCE], { type: 'application/javascript' }));
  return blobURL;
}
