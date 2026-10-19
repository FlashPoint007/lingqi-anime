// Only the topmost modal owns Escape and keyboard focus. Disabled or hidden
// controls must never become the endpoints of the Tab cycle.
export function modalKey(event:KeyboardEvent,dialog:HTMLElement|null,onClose:()=>void){
 if(!dialog)return;
 const dialogs=document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
 if(dialogs[dialogs.length-1]!==dialog)return;
 if(event.key==='Escape'){event.preventDefault();onClose();return;}
 if(event.key!=='Tab')return;
 const controls=Array.from(dialog.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]')).filter(el=>el.tabIndex>=0&&!el.matches(':disabled,[hidden]')&&el.getClientRects().length>0);
 const first=controls[0],last=controls[controls.length-1];
 if(!first){event.preventDefault();dialog.focus();return;}
 if(!dialog.contains(document.activeElement)||event.shiftKey&&document.activeElement===first||!event.shiftKey&&document.activeElement===last){event.preventDefault();(event.shiftKey?last:first).focus();}
}
