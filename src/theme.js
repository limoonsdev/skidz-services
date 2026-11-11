/* Skidz Verify — src/web/theme.js
 * Thème de la vérification : noir pur, carte compacte, typographie Inter servie
 * localement, accents monochromes. Aucun CDN, aucun halo coloré, aucun mode clair.
 */
'use strict';

const THEME = `
:root{
  color-scheme:dark;
  --bg:#000;
  --panel:#08080a;
  --panel2:#0e0e11;
  --line:#1c1c21;
  --text:#f5f5f7;
  --mute:#8b8b93;
  --ok:#7ee787;
  --err:#ff7b72;
  --warn:#e3b341;
  --focus:#fff;
  --radius:18px;
  --font-body:"Inter","SF Pro Text","Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;
  --font-display:"Inter","SF Pro Display","Segoe UI Variable Display","Segoe UI",system-ui,-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;
  --font-mono:ui-monospace,"SFMono-Regular","Cascadia Code","Cascadia Mono",Menlo,Consolas,monospace;
}
@font-face{font-family:Inter;font-style:normal;font-weight:400;font-display:swap;src:url("/assets/fonts/inter-400.ttf") format("truetype")}
@font-face{font-family:Inter;font-style:normal;font-weight:600;font-display:swap;src:url("/assets/fonts/inter-600.ttf") format("truetype")}
@font-face{font-family:Inter;font-style:normal;font-weight:800;font-display:swap;src:url("/assets/fonts/inter-800.ttf") format("truetype")}
*{box-sizing:border-box}
html{background:#000;color-scheme:dark}
body{margin:0;min-height:100svh;padding:clamp(10px,3vw,24px);background:#000;color:var(--text);font-family:var(--font-body);font-size:14.5px;line-height:1.5;display:flex;align-items:center;justify-content:center;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
main{position:relative;z-index:1;width:100%;max-width:430px;padding:22px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 28px 80px rgba(0,0,0,.65)}
main.wide{max-width:560px}
main::before{display:none}
header{text-align:left}
.logo{display:inline-block;color:var(--text);filter:none}
.brand{display:flex;align-items:center;justify-content:flex-start;gap:9px;margin:0 0 18px;font-size:10px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--mute)}
.brand img{width:22px;height:22px;border-radius:6px;object-fit:contain}
h1{margin:0;font-family:var(--font-display);font-size:clamp(23px,5.5vw,29px);font-weight:800;letter-spacing:-.045em;line-height:1.02;text-align:left;text-wrap:balance}
p{margin:10px 0;color:var(--mute);font-size:13.5px}
b,strong{color:var(--text);font-weight:600}
a{color:var(--text);text-decoration-color:var(--line);text-underline-offset:3px}
a:hover{text-decoration-color:var(--text)}
.sub{text-align:left;font-size:12.5px;margin:9px 0 0}
.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin:18px 0 12px;padding:0;list-style:none}
.steps li{flex:auto;min-width:0;padding:8px 0 0;border:0;border-top:1px solid var(--line);border-radius:0;background:none;color:var(--mute);font-size:9.5px;font-weight:600;letter-spacing:.12em;text-align:left;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:none}
.steps li.on{color:var(--text);border-color:var(--text);background:none;box-shadow:none}
.steps li.done{color:var(--ok);border-color:var(--ok);background:none}
#barwrap{height:2px;margin:12px 0 10px;border-radius:2px;background:#17171b;overflow:hidden}
#bar{height:100%;width:0;background:var(--text);border-radius:2px;box-shadow:none;transition:width .3s ease}
#checks{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:12px;background:#050506;overflow:hidden}
#checks li{display:flex;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line);color:var(--mute);font-size:13px}
#checks li:last-child{border-bottom:0}
.dot{flex:none;width:14px;height:14px;border:1.5px solid var(--line);border-radius:50%;position:relative}
#checks li[data-state=run] .dot{border-color:var(--text) var(--line) var(--line) var(--line);animation:spin .8s linear infinite}
#checks li[data-state=ok] .dot{background:var(--ok);border-color:var(--ok);box-shadow:none}
#checks li[data-state=ok] .dot::after,#checks li[data-state=warn] .dot::after{content:"";position:absolute;left:3px;top:0;width:4px;height:7px;border:solid #000;border-width:0 1.5px 1.5px 0;transform:rotate(45deg)}
#checks li[data-state=warn] .dot{background:var(--warn);border-color:var(--warn);box-shadow:none}
#checks li[data-state=ok],#checks li[data-state=warn]{color:var(--text)}
@keyframes spin{to{transform:rotate(360deg)}}
.box{margin-top:12px;padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:var(--panel2);color:var(--mute);font-size:12.5px;line-height:1.55}
.box b{display:block;margin-bottom:3px;color:var(--text)}
details{margin-top:12px;padding:2px 12px;border:1px solid var(--line);border-radius:12px;background:#050506;color:var(--mute);font-size:12.5px}
summary{padding:9px 0;cursor:pointer;color:var(--text);font-weight:600;letter-spacing:-.005em}
summary:focus-visible,button:focus-visible,input:focus-visible,a:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:6px}
details ul{margin:0 0 10px;padding-left:16px}
details li{margin:4px 0}
label.consent{display:flex;gap:10px;align-items:flex-start;margin-top:14px;color:var(--mute);font-size:12.5px;line-height:1.45;cursor:pointer}
label.consent input{flex:none;width:17px;height:17px;margin-top:2px;accent-color:var(--text)}
button,.btn{display:block;width:100%;margin-top:16px;padding:13px 15px;border:0;border-radius:11px;background:var(--text);color:#000;font:700 14px/1 var(--font-body);text-align:center;text-decoration:none;cursor:pointer;box-shadow:none;transition:opacity .18s ease,transform .12s ease}
button::after,.btn::after{display:none}
button:hover:not(:disabled),.btn:hover{opacity:.88;transform:none}
button:active:not(:disabled){transform:scale(.995)}
button:disabled{opacity:.28;cursor:not-allowed}
#status{min-height:20px;margin:9px 0 0;font-size:12px;text-align:center;letter-spacing:.005em}
.small{font-size:11.5px}
.ref{padding:2px 7px;border:1px solid var(--line);border-radius:6px;background:var(--panel2);color:var(--text);font-family:var(--font-mono);font-size:.95em}
ul.reasons{padding-left:16px;color:var(--mute);font-size:12.5px;line-height:1.6;text-align:left}
ul.reasons li{margin:4px 0}
.result{text-align:center}
.result h1{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:9px;text-align:center}
.mark{display:inline-grid;place-items:center;width:36px;height:36px;border:1.5px solid currentColor;border-radius:50%;font-size:18px;box-shadow:none}
.legal{margin:18px 0 0;color:var(--mute);font-size:9px;letter-spacing:.13em;text-align:center;text-transform:uppercase;opacity:.65}
.hero{margin:0 0 16px}
.hero img{display:block;width:100%;max-height:150px;height:auto;object-fit:cover;border:1px solid var(--line);border-radius:14px}
.captcha{display:flex;gap:12px;align-items:center;margin-top:12px;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--panel2)}
.captcha-img{display:block;flex:none;max-width:100%;height:auto;border-radius:8px}
.cap-field{flex:1;min-width:0}
.cap-field label{display:block;color:var(--mute);font-size:11.5px}
.cap-field input{width:100%;margin-top:5px;padding:10px 11px;border:1px solid var(--line);border-radius:8px;background:#000;color:var(--text);font:700 15px/1 var(--font-mono);letter-spacing:.22em;text-transform:uppercase}
::selection{background:var(--text);color:#000}
html:not(.js) .steps,html:not(.js) #checks,html:not(.js) #barwrap{display:none}
@media (max-width:430px){main{padding:18px}.captcha{flex-direction:column;align-items:stretch}.captcha-img{margin:0 auto}.steps li{font-size:9px}}
@media (prefers-reduced-motion:reduce){#checks li[data-state=run] .dot{animation:none}#bar{transition:none}button,.btn{transition:none}}
`;

/** Aucun halo : le fond doit rester un noir pur. */
const DECOR = '';

module.exports = { THEME, DECOR };
