import { readableError } from "./domain";
export class ClientError extends Error {constructor(public code:string){super(readableError(code));}}
export async function studyRequest<T>(url:string,body?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch(url,{method:body===undefined?"GET":"POST",credentials:"same-origin",cache:"no-store",signal,headers:body===undefined?{}:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
 let result;try{result=await response.json();}catch{throw new ClientError("SERVICE_UNAVAILABLE");}
 if(!response.ok||!result.ok)throw new ClientError(result.error??"SERVICE_UNAVAILABLE");return result as T;
}
export const errorText=(e:unknown)=>e instanceof Error?e.message:"No se complet\u00f3 la operaci\u00f3n.";
