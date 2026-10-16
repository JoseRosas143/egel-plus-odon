import { StudyError } from "./domain";
export async function readJson(request: Request, maximum=196608):Promise<unknown> {
 if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json") throw new StudyError("JSON_REQUIRED",415);
 const declared=request.headers.get("content-length");
 if(declared&&(!/^\d+$/.test(declared)||Number(declared)>maximum))throw new StudyError("BODY_TOO_LARGE",413);
 if(!request.body)throw new StudyError("INVALID_JSON");
 const reader=request.body.getReader();const pieces:Uint8Array[]=[];let size=0;
 try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>maximum){await reader.cancel();throw new StudyError("BODY_TOO_LARGE",413);}pieces.push(chunk.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let n=0;for(const p of pieces){bytes.set(p,n);n+=p.length;}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{throw new StudyError("INVALID_JSON");}
}
