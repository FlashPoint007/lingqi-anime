// Runs independently of the application module so a missing/failed JS chunk
// cannot leave a static page looking like an endless account-loading request.
(()=>{
 const panel=document.getElementById('startup-recovery'),retry=document.getElementById('startup-retry');if(!panel||!retry)return;
 let timer;
 const hydrated=()=>document.documentElement.dataset.lingqiHydrated==='1';
 const show=()=>{if(!hydrated())panel.hidden=false;};
 const failed=event=>{if(event.target?.tagName==='SCRIPT'&&event.target.src?.includes('/_next/'))show();};
 const ready=()=>{clearTimeout(timer);panel.hidden=true;window.removeEventListener('error',failed,true);window.removeEventListener('lingqi:ready',ready);};
 retry.addEventListener('click',()=>window.location.reload());
 if(hydrated())return;
 window.addEventListener('error',failed,true);window.addEventListener('lingqi:ready',ready);timer=setTimeout(show,12000);
})();
