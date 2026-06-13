package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// ServeH5Page 验证令牌后重定向到灵犀主界面
func ServeH5Page(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusOK, h5ErrorHTML("未提供访问令牌"))
		return
	}

	c.Header("Content-Type", "text/html; charset=utf-8")
	// 隧道 token 直接放行，无需验证 H5 令牌
	if strings.HasPrefix(token, "lx_tunnel_") {
		c.String(http.StatusOK, h5TunnelRedirectHTML)
		return
	}
	c.String(http.StatusOK, h5RedirectHTML)
}

const h5RedirectHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>灵犀 · 连接中</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5;color:#1a1a1a}
@media(prefers-color-scheme:dark){body{background:#0d0d0f;color:#e5e5e5}}
.card{text-align:center;padding:40px 32px}
.logo{width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,#7c5cff,#5e8bff);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:#fff;font-size:28px;font-weight:700;box-shadow:0 6px 24px rgba(124,92,255,0.35)}
h1{font-size:20px;font-weight:700;margin-bottom:8px}
p{font-size:14px;color:#999;margin-bottom:4px}
.spinner{width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:#7c5cff;border-radius:50%;animation:spin .8s linear infinite;margin:20px auto 0}
@keyframes spin{to{transform:rotate(360deg)}}
.err{color:#ef4444;margin-top:16px;font-size:14px;display:none}
</style>
</head>
<body>
<div class="card">
<div class="logo">灵</div>
<h1>灵犀</h1>
<p>正在连接…</p>
<div class="spinner" id="sp"></div>
<div class="err" id="err"></div>
</div>
<script>
(async function(){
  const token=new URLSearchParams(location.search).get('token');
  if(!token){showError('未提供访问令牌');return}
  try{
    // 验证令牌
    const r=await fetch('/api/h5-access/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
    if(!r.ok)throw new Error('令牌无效或已过期');
    // 自动游客登录（手机端无需走 SSO）
    try{await fetch('/api/auth/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'手机访问'})})}catch{}
    // 标记为手机访问模式（localStorage + URL hash 双保险）
    try{localStorage.setItem('h5_mobile','1')}catch{}
    try{sessionStorage.setItem('h5_mobile','1')}catch{}
    location.replace('/?h5=1');
  }catch(e){
    showError(e.message);
  }
  function showError(msg){
    const sp=document.getElementById('sp');
    const err=document.getElementById('err');
    if(sp)sp.style.display='none';
    if(err){err.textContent=msg;err.style.display='block'}
    document.querySelector('p').textContent='连接失败';
  }
})();
</script>
</body>
</html>`

// 隧道访问专用：跳过令牌验证，直接游客登录后跳转
const h5TunnelRedirectHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>灵犀 · 连接中</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5;color:#1a1a1a}
@media(prefers-color-scheme:dark){body{background:#0d0d0f;color:#e5e5e5}}
.card{text-align:center;padding:40px 32px}
.logo{width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,#7c5cff,#5e8bff);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:#fff;font-size:28px;font-weight:700;box-shadow:0 6px 24px rgba(124,92,255,0.35)}
h1{font-size:20px;font-weight:700;margin-bottom:8px}
p{font-size:14px;color:#999}
.spinner{width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:#7c5cff;border-radius:50%;animation:spin .8s linear infinite;margin:20px auto 0}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="card">
<div class="logo">灵</div>
<h1>灵犀</h1>
<p>正在连接…</p>
<div class="spinner"></div>
</div>
<script>
(async function(){
  // 计算隧道基础路径（如 /tunnel/lx_tunnel_xxx）
  var p=location.pathname;
  var base='';
  var m=p.match(/^(\/tunnel\/[^/]+)/);
  if(m)base=m[1];
  try{await fetch(base+'/api/auth/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'远程访问'})})}catch{}
  try{localStorage.setItem('h5_mobile','1')}catch{}
  try{sessionStorage.setItem('h5_mobile','1')}catch{}
  location.replace(base+'/?h5=1');
})();
</script>
</body>
</html>`

func h5ErrorHTML(msg string) string {
	return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>灵犀</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5;color:#1a1a1a}
@media(prefers-color-scheme:dark){body{background:#0d0d0f;color:#e5e5e5}}
.c{text-align:center;padding:40px}.err{color:#ef4444;font-size:16px}</style>
</head><body><div class="c"><div class="err">` + msg + `</div></div></body></html>`
}
