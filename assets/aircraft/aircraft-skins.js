/* НАЕБАЦИЯ VI · SVG-ресурсы силуэтов в assets/aircraft/.
   Настоящие отдельные SVG исходники загружаются один раз при старте,
   затем встраиваются как пути в маркеры. Цвет и поворот задаются штатным
   вызовом NAEBACIA_SKINS.svg(id, heading, color). */
(function (root) {
  'use strict';
  const entries = [["standard","Стандартный · Cessna"],["liner","Лайнер"],["tu154","Тушка"],["fighter","Истребитель"],["shuttle","Шаттл"],["rocket","Ракета"],["funny","Писюн"],["da40","Diamond DA40"],["da42","Diamond DA42"],["mi8","Ми-8"]];
  const skins = Object.create(null);
  for (const [id,label] of entries) skins[id] = {label, file: id+'.svg', shapes: ''};
  const ids = entries.map(entry=>entry[0]);
  // Единственная аварийная фигура, если ресурс временно не загрузился.
  const fallback = '<path d="M50 4 Q47 4 47 11 L46 38 L5 48 Q3 49 4 55 L46 50 L47 83 L34 89 L34 95 L49 90 L51 90 L66 95 L66 89 L53 83 L54 50 L96 55 Q97 49 95 48 L54 38 L53 11 Q53 4 50 4Z"/>';
  let loadPromise=null;
  let failures=[];
  function assetUrl(file){return new URL('./assets/aircraft/'+file, document.baseURI);}
  async function load(){
    if(loadPromise)return loadPromise;
    loadPromise=(async()=>{
      const problems=[];
      await Promise.all(ids.map(async id=>{
        try {
          const res=await fetch(assetUrl(skins[id].file), {cache:'no-cache'});
          if(!res.ok)throw new Error('HTTP '+res.status);
          const raw=await res.text();
          const doc=new DOMParser().parseFromString(raw,'image/svg+xml');
          if(doc.querySelector('parsererror'))throw new Error('Ошибка XML');
          const group=doc.querySelector('g[data-silhouette]');
          if(!group || !group.children.length)throw new Error('Нет контура');
          // Вся библиотека своя: разрешаем только простую SVG-геометрию.
          for(const el of group.querySelectorAll('*')){
            if(!['path','circle','rect','ellipse','polygon','polyline','line'].includes(el.tagName.toLowerCase()))throw new Error('Неизвестный SVG-элемент');
            for(const attr of el.attributes){
              if(attr.name.startsWith('on')||['href','style','src','filter'].includes(attr.name))throw new Error('Недопустимый атрибут');
            }
          }
          skins[id].shapes=group.innerHTML;
        } catch(err){problems.push(id);console.warn('[НАЕБАЦИЯ] Силуэт '+id+' не загружен:',err);}
      }));
      failures=problems;
      return {loaded:ids.length-failures.length,failed:[...failures]};
    })();
    return loadPromise;
  }
  function svg(id, heading, color){
    const found=skins[id] || skins.standard;
    const deg=Number.isFinite(heading) ? ((heading%360)+360)%360 : 0;
    const safeColor=/^#[0-9a-fA-F]{3,8}$/.test(color||'')?color:'#08c';
    const shapes=found.shapes || (skins.standard.shapes || fallback);
    return '<svg viewBox="0 0 100 100" width="52" height="52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ' +
      'style="transform:rotate('+deg+'deg);transform-origin:50% 50%;filter:drop-shadow(0 1px 2px rgba(0,0,0,.75))">' +
      '<g fill="'+safeColor+'" stroke="#fff" stroke-width=".72" paint-order="stroke fill" stroke-linejoin="round">'+shapes+'</g></svg>';
  }
  root.NAEBACIA_SKINS=Object.freeze({skins,ids,svg,load,get failures(){return [...failures]}});
})(window);
