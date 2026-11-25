/* Conmutador Vertical / Horizontal para móvil.
   «Horizontal» abre el visor a pantalla completa y bloquea la orientación cuando el navegador lo
   permite (Screen Orientation API, p. ej. Chrome en Android). Si no (Safari en iPhone), pide girar
   el móvil: el diseño horizontal se aplica solo por media query. */
(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const portrait=$('#orient-portrait'),landscape=$('#orient-landscape'),toast=$('#toast');
  if(!portrait||!landscape)return;
  const isLandscape=matchMedia('(orientation: landscape)');
  let toastTimer;
  function say(text){
    clearTimeout(toastTimer);toast.textContent=text;toast.hidden=false;
    toastTimer=setTimeout(()=>{toast.hidden=true;},4200);
  }
  function sync(){
    const wide=isLandscape.matches;
    portrait.setAttribute('aria-pressed',String(!wide));
    landscape.setAttribute('aria-pressed',String(wide));
    document.documentElement.classList.toggle('is-fullscreen',Boolean(document.fullscreenElement));
    window.map?.resize?.();
  }
  async function fullscreen(on){
    try{
      if(on&&!document.fullscreenElement&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen({navigationUI:'hide'});
      if(!on&&document.fullscreenElement)await document.exitFullscreen();
      return true;
    }catch{return false;}
  }
  landscape.onclick=async()=>{
    await fullscreen(true);
    try{await screen.orientation.lock('landscape');sync();}
    catch{if(!isLandscape.matches)say('Gira el móvil para verlo en horizontal; el visor se adapta solo.');}
  };
  portrait.onclick=async()=>{
    try{screen.orientation?.unlock?.();}catch{}
    await fullscreen(false);
    if(isLandscape.matches)say('Gira el móvil a vertical para volver a la vista normal.');
  };
  isLandscape.addEventListener('change',()=>{sync();toast.hidden=true;});
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement){try{screen.orientation?.unlock?.();}catch{}}sync();});
  sync();
})();
