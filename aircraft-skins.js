/* НАЕБАЦИЯ VI · независимая библиотека SVG-силуэтов, вид сверху.
   Геометрия в координатах 60×60; нос каждого силуэта смотрит на север. */
(function (root) {
  'use strict';
  const skins = {
    standard: {
      label: 'Стандартный',
      shapes: '<path d="M30 2 C27.9 2 27 5.1 27 8.4 L26.5 18.8 L4 18 Q1.7 18 1.7 20.2 L1.7 27.8 Q1.7 29.5 3.6 29.5 L26.4 28.6 L27.3 47.3 L18.3 49.7 Q17.6 50 17.6 51.2 L17.6 55.8 L27.9 54.4 L28.4 57.7 Q30 59 31.6 57.7 L32.1 54.4 L42.4 55.8 L42.4 51.2 Q42.4 50 41.7 49.7 L32.7 47.3 L33.6 28.6 L56.4 29.5 Q58.3 29.5 58.3 27.8 L58.3 20.2 Q58.3 18 56 18 L33.5 18.8 L33 8.4 C33 5.1 32.1 2 30 2Z"/>'
    },
    liner: {
      label: 'Лайнер',
      shapes: '<path d="M30 1 Q27.6 4 27.6 10 L26.8 19 L3.5 37.5 Q2.5 38.5 3.4 42.5 L26.5 33.5 L27.2 49 L17.5 54 L18 57 L29 53.8 L30 58 L31 53.8 L42 57 L42.5 54 L32.8 49 L33.5 33.5 L56.6 42.5 Q57.5 38.5 56.5 37.5 L33.2 19 L32.4 10 Q32.4 4 30 1 Z"/>'
    },
    fighter: {
      label: 'Истребитель',
      shapes: '<path d="M30 1 Q27 5 26.5 15 L25.5 22 L5 39 L5 45 L23.6 40 L24.8 51 L16.8 55.5 L16.5 58 L29.3 55.4 L30 58 L30.7 55.4 L43.5 58 L43.2 55.5 L35.2 51 L36.4 40 L55 45 L55 39 L34.5 22 L33.5 15 Q33 5 30 1Z"/><path d="M23.5 43 L28 45.5 L27 54.5 L23 54Z"/><path d="M36.5 43 L32 45.5 L33 54.5 L37 54Z"/><path d="M28 15 Q30 11 32 15 L32 30 L28 30Z"/>'
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
