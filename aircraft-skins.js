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
      shapes: '<path d="M30 1 C26.8 1 25 4.2 25 8.8 L24.9 16.5 L15.8 20.3 L3.6 25.9 Q1.5 26.8 1.9 30.4 L24.9 27.7 L25.7 47.1 L18.2 51.1 L18.2 56.5 L27.8 53.8 L28.7 58 L31.3 58 L32.2 53.8 L41.8 56.5 L41.8 51.1 L34.3 47.1 L35.1 27.7 L58.1 30.4 Q58.5 26.8 56.4 25.9 L44.2 20.3 L35.1 16.5 L35 8.8 C35 4.2 33.2 1 30 1 Z"/><path d="M27.3 16.5 L27.3 4.2 Q27.3 2.3 30 2.3 Q32.7 2.3 32.7 4.2 L32.7 16.5Z"/><path d="M27.4 42.5 L27.4 54.6 L32.6 54.6 L32.6 42.5Z"/>'
    },
    fighter: {
      label: 'Истребитель',
      shapes: '<path d="M30 1 L26.8 8.5 L18.5 14.2 L16.1 24.4 L6.2 31.8 L6.6 38.5 L18.2 35.5 L22.8 44.4 L17.8 52.4 L18.4 58 L27.8 51.6 L27.8 40.5 L25.1 33 L25.1 26.8 L34.9 26.8 L34.9 33 L32.2 40.5 L32.2 51.6 L41.6 58 L42.2 52.4 L37.2 44.4 L41.8 35.5 L53.4 38.5 L53.8 31.8 L43.9 24.4 L41.5 14.2 L33.2 8.5 Z"/><path d="M27.7 3.2 Q30 0.8 32.3 3.2 L31.4 11 L28.6 11Z"/><path d="M26 55 L30 58 L34 55 Z"/>'
    },
    shuttle: {
      label: 'Шаттл',
      shapes: '<path d="M30 1 C26.6 1 24.8 3.7 24.8 8.7 L24.8 19.2 L18.7 24.1 L9.8 30.8 Q7.8 32.3 8.2 37.8 L24.9 35.1 L25.5 49.3 L20.8 53.7 L20.8 58 L27.4 55.6 L28.2 58 L31.8 58 L32.6 55.6 L39.2 58 L39.2 53.7 L34.5 49.3 L35.1 35.1 L51.8 37.8 Q52.2 32.3 50.2 30.8 L41.3 24.1 L35.2 19.2 L35.2 8.7 C35.2 3.7 33.4 1 30 1 Z"/><path d="M27.8 11.5 Q30 9.2 32.2 11.5 L31.5 18.4 L28.5 18.4Z"/>'
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
    const found = skins[id] || skins.standard;
    const deg = Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : 0;
    const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(color || '') ? color : '#08c';
    return '<svg viewBox="0 0 60 60" width="52" height="52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ' +
      'style="transform:rotate(' + deg + 'deg);transform-origin:50% 50%;filter:drop-shadow(0 1px 2px rgba(0,0,0,.75))">' +
      '<g fill="' + safeColor + '" stroke="#fff" stroke-width="1.2" stroke-linejoin="round">' + found.shapes + '</g></svg>';
  }
  root.NAEBACIA_SKINS = Object.freeze({ skins, svg, ids: Object.keys(skins) });
})(window);
