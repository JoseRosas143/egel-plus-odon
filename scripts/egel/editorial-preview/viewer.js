/* global document, window, history, fetch */
const $=id=>document.getElementById(id);
const state={number:null,opened:new Set(),panels:new Map(),sequence:0};
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
async function read(url,options){
 const response=await fetch(url,{cache:'no-store',credentials:'same-origin',...options});
 if(!response.ok)throw Error(response.status===401?'Sesión privada no disponible. Reabre el enlace del visor.':'No se pudo revalidar el contenido. No se mostró ni se publicó una versión alternativa.');
 return response.json();
}
function panel(id,focus=false){
 if(state.number)state.panels.set(state.number,id);
 for(const button of document.querySelectorAll('[data-panel]')){const selected=button.dataset.panel===id;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;if(selected&&focus)button.focus();}
 for(const item of document.querySelectorAll('.panel'))item.classList.toggle('mobileActive',item.id===id);
}
for(const button of document.querySelectorAll('[data-panel]')){
 button.addEventListener('click',()=>panel(button.dataset.panel));
 button.addEventListener('keydown',event=>{const buttons=[...document.querySelectorAll('[data-panel]')],index=buttons.indexOf(button);
   const next=event.key==='ArrowRight'?(index+1)%3:event.key==='ArrowLeft'?(index+2)%3:event.key==='Home'?0:event.key==='End'?2:null;
   if(next!==null){event.preventDefault();panel(buttons[next].dataset.panel,true);}
 });
}
function sourceCard(source){
 const article=document.createElement('article');article.className='source';
 const label=document.createElement('span');label.className='sourceId';label.textContent=source.referenceId;
 const title=document.createElement('h3');title.textContent=source.title;
 const scope=document.createElement('p');scope.textContent=source.scope;
 const readings={relevant_web_sections:'Apartados web pertinentes',relevant_web_section:'Apartado web pertinente',visual_pdf_page:'Página PDF cotejada visualmente',
   full_text_not_truncated:'Texto completo del artículo',relevant_atlas_sections:'Apartados pertinentes del atlas'};
 const locator=document.createElement('small');locator.textContent='Lectura registrada: '+(readings[source.read]??source.read);
 const link=document.createElement('a');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Abrir fuente externa ↗';
 article.append(label,title,scope,locator,link);
 if(source.license){const rights=document.createElement('p');rights.className='rights';rights.textContent=source.license;article.append(rights);}
 return article;
}
async function explanation(number,sequence){
 const data=await read('/api/records/'+number+'/explanation');
 if(sequence!==state.sequence)return;
 // HTML is produced only by the existing safe Tutor renderer on this local
 // authenticated server. Metadata, original question and source titles use textContent.
 $('explanation').innerHTML=data.html;
 $('explanation').hidden=false;$('closed').hidden=true;$('reveal').textContent='Ocultar explicación';
}
async function show(number){
 const sequence=++state.sequence;state.number=number;
 $('panels').hidden=true;$('explanation').replaceChildren();$('explanation').hidden=true;$('closed').hidden=false;
 $('reveal').disabled=true;$('reveal').textContent='Abrir explicación';status('Validando reactivo y referencias…');
 try{
   const data=await read('/api/records/'+number);if(sequence!==state.sequence)return;
   $('case-title').textContent='Reactivo '+data.number;$('stem').textContent=data.question.stem;
   $('options').replaceChildren(...data.question.options.map(option=>{const li=document.createElement('li');li.textContent=option.letter+'. '+option.text;return li;}));
   $('sources').replaceChildren(...data.sources.map(sourceCard));$('integrity').textContent='Huella de preparación: '+data.preparationSha256;
   panel(state.panels.get(number)??'case-panel');
   if(state.opened.has(number))await explanation(number,sequence);
   if(sequence!==state.sequence)return;
   $('panels').hidden=false;$('reveal').disabled=false;status('Contenido privado validado · '+data.sources.length+' fuentes con cotejo acotado');
 }catch(error){if(sequence===state.sequence){state.opened.delete(number);$('explanation').replaceChildren();$('panels').hidden=true;status(error.message,true);}}
}
$('question').addEventListener('change',event=>show(event.target.value));
$('reveal').addEventListener('click',async()=>{
 const number=state.number,sequence=state.sequence;
 if(state.opened.has(number)){state.opened.delete(number);$('explanation').hidden=true;$('closed').hidden=false;$('reveal').textContent='Abrir explicación';return;}
 $('reveal').disabled=true;
 try{await explanation(number,sequence);if(sequence===state.sequence){state.opened.add(number);status('Borrador abierto para revisión. No se guardó una respuesta ni se aprobó su publicación.');}}
 catch(error){if(sequence===state.sequence){$('explanation').replaceChildren();$('explanation').hidden=true;status(error.message,true);}}
 finally{if(sequence===state.sequence)$('reveal').disabled=false;}
});
async function start(){
 const token=window.location.hash.slice(1);history.replaceState(null,'','/');
 try{
   if(token)await read('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
   const data=await read('/api/records');
   $('question').replaceChildren(...data.records.map(record=>{const option=document.createElement('option');option.value=record.number;option.textContent='Reactivo '+record.number;return option;}));
   $('question').disabled=false;await show(data.records[0].number);
 }catch(error){status(error.message,true);}
}
start();
