// 添加 parseCookies 函数定义
function parseCookies(cookieString) {
  const cookies = new Map();
  if (cookieString) {
      cookieString.split(';').forEach(cookie => {
          const [name, value] = cookie.trim().split('=');
          cookies.set(name, value);
      });
  }
  return cookies;
}

async function handleRequest(request, env) {
  const mytoken = env.TOKEN || 'qq965868345';
  const url = new URL(request.url);
  
  try {
      // 验证 KV 绑定
      if (!env.KV) {
          throw new Error('KV namespace not bound');
      }

      // 认证检查
      const authHeader = request.headers.get('Authorization');
      const cookies = parseCookies(request.headers.get('Cookie'));
      const cookieToken = cookies.get('auth_token');
      const bearerToken = authHeader?.replace('Bearer ', '');
      
      // 处理根路径
      if (url.pathname === '/') {
          if (request.method === 'GET') {
              return new Response(authFormHTML(), {
                  headers: { 'Content-Type': 'text/html; charset=UTF-8' },
              });
          }
          if (request.method === 'POST') {
              if (request.headers.get('Content-Type')?.includes('multipart/form-data')) {
                  // 验证认证
                  if (bearerToken !== mytoken && cookieToken !== mytoken) {
                      return new Response('Unauthorized', { status: 403 });
                  }
                  // 处理文件上传
                  const formData = await request.formData();
                  const file = formData.get('file');
                  if (!file) {
                      return new Response('No file uploaded', { status: 400 });
                  }
                  const fileName = file.name;
                  const fileContent = await file.text();
                  await env.KV.put(fileName, fileContent);
                  return Response.redirect(request.url, 302);
              } else {
                  // 处理认证
                  const formData = await request.formData();
                  if (formData.get('token') === mytoken) {
                      return new Response(configHTML(url.hostname), {
                          headers: {
                              'Content-Type': 'text/html; charset=UTF-8',
                              'Set-Cookie': `auth_token=${mytoken}; HttpOnly; Secure; SameSite=Strict; Path=/`
                          },
                      });
                  }
                  return new Response(authFormHTML('Invalid token'), {
                      status: 403,
                      headers: { 'Content-Type': 'text/html; charset=UTF-8' },
                  });
              }
          }
      }

      // 验证认证
      if (bearerToken !== mytoken && cookieToken !== mytoken) {
          return new Response('Unauthorized', { status: 403 });
      }

      // 处理特殊路径
      const fileName = url.pathname.slice(1).toLowerCase();
      if (fileName === 'config/update.bat') {
          return new Response(generateBatScript(url.hostname, mytoken), {
              headers: {
                  'Content-Type': 'text/plain; charset=utf-8',
                  'Content-Disposition': 'attachment; filename=update.bat'
              },
          });
      }
      if (fileName === 'config/update.sh') {
          return new Response(generateShScript(url.hostname, mytoken), {
              headers: {
                  'Content-Type': 'text/plain; charset=utf-8',
                  'Content-Disposition': 'attachment; filename=update.sh'
              },
          });
      }

      // 处理文件操作
      if (request.method === 'GET') {
          const value = await env.KV.get(fileName);
          if (!value) return new Response('Not Found', { status: 404 });
          return new Response(value);
      }

      if (request.method === 'POST') {
          const text = url.searchParams.get('text');
          const b64 = url.searchParams.get('b64');
          if (!text && !b64) {
              return new Response('No content provided', { status: 400 });
          }

          const content = text || atob(b64.replace(/ /g, '+'));
          await env.KV.put(fileName, content);
          return new Response('Updated');
      }

      return new Response('Method not allowed', { status: 405 });

  } catch (err) {
      return new Response(`Error: ${err.message}`, { status: 500 });
  }
}

function configHTML(domain) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Configuration</title>
  <style>
      body { font-family: system-ui; max-width: 800px; margin: 0 auto; padding: 20px; }
      .container { background: #f5f5f5; padding: 20px; border-radius: 8px; }
      .button { display: inline-block; padding: 10px 20px; background: #0066ff; color: white; 
              text-decoration: none; border-radius: 4px; margin: 5px 0; }
      .code { background: #fff; padding: 10px; border-radius: 4px; }
      input { width: 100%; padding: 8px; margin: 10px 0; }
      .upload-form { margin: 20px 0; padding: 20px; border: 2px dashed #0066ff; border-radius: 8px; }
      .upload-button { background: #0066ff; color: white; padding: 10px 20px; border: none; 
                      border-radius: 4px; cursor: pointer; }
      .upload-status { margin-top: 10px; color: #666; }
      #file-list { margin-top: 20px; }
      .file-item { background: white; padding: 10px; margin: 5px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
      <h2>Configuration</h2>
      
      <h3>File Upload:</h3>
      <form class="upload-form" method="POST" enctype="multipart/form-data">
          <input type="file" name="file" required>
          <button type="submit" class="upload-button">Upload File</button>
      </form>
      
      <h3>Windows Script:</h3>
      <a href="/config/update.bat" class="button">Download Windows Script</a>
      <div class="code">update.bat yourfile.txt</div>
      
      <h3>Linux Script:</h3>
      <a href="/config/update.sh" class="button">Download Linux Script</a>
      <div class="code">chmod +x update.sh
./update.sh yourfile.txt</div>
      
      <h3>View Files:</h3>
      <input type="text" id="filename" placeholder="Enter filename">
      <a href="#" class="button" onclick="viewFile()">View</a>
      
      <div id="file-list"></div>
  </div>

  <script>
      function viewFile() {
          const name = document.getElementById('filename').value.trim();
          if (name) {
              window.open('/' + name);
          } else {
              alert('Please enter a filename');
          }
      }
  </script>
</body>
</html>`;
}

function authFormHTML(error = '') {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication</title>
  <style>
      body { font-family: system-ui; max-width: 400px; margin: 50px auto; padding: 20px; }
      input { width: 100%; padding: 8px; margin: 10px 0; }
      button { width: 100%; padding: 10px; background: #0066ff; color: white; border: none; border-radius: 4px; }
      .error { color: red; margin-bottom: 10px; }
  </style>
</head>
<body>
  <form method="POST">
      <h2>Login</h2>
      ${error ? `<div class="error">${error}</div>` : ''}
      <input type="password" name="token" placeholder="Enter token" required>
      <button type="submit">Submit</button>
  </form>
</body>
</html>`;
}

// 其他函数保持不变
function generateBatScript(domain, token) {
  return `@echo off
chcp 65001
setlocal

set "DOMAIN=${domain}"
set "TOKEN=${token}"

if "%~1"=="" (
  echo Please specify a file
  pause
  exit /b 1
)

set "FILENAME=%~nx1"

if not exist "%FILENAME%" (
  echo File not found: %FILENAME%
  pause
  exit /b 1
)

powershell -NoProfile -Command "& {$content = [System.IO.File]::ReadAllText('%FILENAME%', [System.Text.Encoding]::UTF8); $bytes = [System.Text.Encoding]::UTF8.GetBytes($content); $base64 = [Convert]::ToBase64String($bytes); $base64 | Out-File -NoNewline 'tmp_content.b64'}"

if %ERRORLEVEL% neq 0 (
  echo Failed to read file
  pause
  exit /b 1
)

set /p BASE64_TEXT=<tmp_content.b64
del tmp_content.b64

curl -H "Authorization: Bearer %TOKEN%" --data-urlencode "b64=%BASE64_TEXT%" "https://%DOMAIN%/%FILENAME%"

if %ERRORLEVEL% neq 0 (
  echo Upload failed
  pause
  exit /b 1
)

echo Update successful
timeout /t 3 >nul
exit /b 0`;
}

function generateShScript(domain, token) {
  return `#!/bin/bash
set -e
DOMAIN="${domain}"
TOKEN="${token}"

if [ -z "$1" ]; then
  echo "Please specify a file"
  exit 1
fi

FILENAME="$1"

if [ ! -f "$FILENAME" ]; then
  echo "File not found: $FILENAME"
  exit 1
fi

BASE64_TEXT=$(base64 -w 0 < "$FILENAME")

curl -H "Authorization: Bearer ${TOKEN}" \
   --data-urlencode "b64=${BASE64_TEXT}" \
   "https://${DOMAIN}/${FILENAME}"

echo "Update successful"`;
}

export default {
  fetch: handleRequest
};
