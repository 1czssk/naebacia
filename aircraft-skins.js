/* НАЕБАЦИЯ VI · независимая библиотека SVG-силуэтов, вид сверху.
   Геометрия в координатах 60×60; нос каждого силуэта смотрит на север. */
(function (root) {
  'use strict';
  const skins = {
    standard: {
      label: 'Стандартный',
      shapes: '<path d="M30 2 C27.9 2 27 5.1 27 8.4 L26.5 18.8 L4 18 Q1.7 18 1.7 20.2 L1.7 27.8 Q1.7 29.5 3.6 29.5 L26.4 28.6 L27.3 47.3 L18.3 49.7 Q17.6 50 17.6 51.2 L17.6 55.8 L27.9 54.4 L28.4 57.7 Q30 59 31.6 57.7 L32.1 54.4 L42.4 55.8 L42.4 51.2 Q42.4 50 41.7 49.7 L32.7 47.3 L33.6 28.6 L56.4 29.5 Q58.3 29.5 58.3 27.8 L58.3 20.2 Q58.3 18 56 18 L33.5 18.8 L33 8.4 C33 5.1 32.1 2 30 2Z"/>'
    },
    tushka: {
      label: 'Тушка',
      shapes: '<path d="M30 1 Q27 4 27 9 L26 21 L2.4 38 L2 44 L26 34 L27 50 L18 55 L18 58 L29 55 L30 59 L31 55 L42 58 L42 55 L33 50 L34 34 L58 44 L57.6 38 L34 21 L33 9 Q33 4 30 1Z"/><path d="M19.5 39 Q16 39 16 42 L16 52 Q18 55 20.5 52 L21 42 Q21 40 19.5 39Z"/><path d="M40.5 39 Q44 39 44 42 L44 52 Q42 55 39.5 52 L39 42 Q39 40 40.5 39Z"/><path d="M28.6 43 L31.4 43 L33 55 L27 55Z"/>'
    },
    liner: {
      label: 'Лайнер',
      shapes: '<path d="M30 1 Q27 3 27 10 L26 20 L3 36 L3 42 L26 33 L27.2 49 L18 54 L18 57 L29 54 L30 58 L31 54 L42 57 L42 54 L32.8 49 L34 33 L57 42 L57 36 L34 20 L33 10 Q33 3 30 1Z"/><ellipse cx="18" cy="37" rx="4" ry="8"/><ellipse cx="42" cy="37" rx="4" ry="8"/>'
    },
    fighter: {
      label: 'Истребитель',
      shapes: '<path d="M30 1 L34 15 L35 22 L54 39 L55 47 L37 40 L38 53 L47 57 L44 59 L32 56 L30 59 L28 56 L16 59 L13 57 L22 53 L23 40 L5 47 L6 39 L25 22 L26 15Z"/><path d="M27 15 L30 9 L33 15 L33 29 L27 29Z"/>'
    },
    rocket: {
      label: 'Ракета',
      shapes: '<path d="M30 1 Q19 13 21 33 L22 40 L12 49 L12 58 L24 51 L27 55 L33 55 L36 51 L48 58 L48 49 L38 40 L39 33 Q41 13 30 1Z"/><circle cx="30" cy="22" r="4.8"/><path d="M26 54 L30 59 L34 54Z"/>'
    },
    funny: {
      label: 'Писюн',
      shapes: '<rect x="23" y="12" width="14" height="34" rx="7"/><path d="M23 16 Q20 7 30 4 Q40 7 37 16Z"/><circle cx="21" cy="48" r="10"/><circle cx="39" cy="48" r="10"/>'
    }
  };
  function svg(id, heading, color) {
    const found=skins[id] || skins.standard;
    const deg=Number.isFinite(heading) ? ((heading%360)+360)%360 : 0;
    const safeColor=/^#[0-9a-fA-F]{3,8}$/.test(color||'')?color:'#08c';
    return '<svg viewBox="0 0 60 60" width="52" height="52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" '+
      'style="transform:rotate('+deg+'deg);transform-origin:50% 50%;filter:drop-shadow(0 1px 2px rgba(0,0,0,.75))">'+
      '<g fill="'+safeColor+'" stroke="#fff" stroke-width="1.2" stroke-linejoin="round">'+found.shapes+'</g></svg>';
  }
  root.NAEBACIA_SKINS=Object.freeze({skins,svg,ids:Object.keys(skins)});
})(window);
