const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");

const rootDir = path.join(__dirname, "dist");
const port = Number(process.env.PORT || 8080);
const apiProxyBaseUrl = process.env.API_PROXY_BASE_URL || "";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[extension] || "application/octet-stream";

  response.writeHead(200, {
    "Content-Type": contentType,
  });

  fs.createReadStream(filePath).pipe(response);
}

function proxyApiRequest(request, response) {
  if (!apiProxyBaseUrl) {
    response.writeHead(502, {
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(
      JSON.stringify({
        error: {
          code: "API_PROXY_NOT_CONFIGURED",
          message: "API 代理地址未配置。",
        },
      }),
    );
    return;
  }

  const targetUrl = new URL(request.url, apiProxyBaseUrl);
  const transport = targetUrl.protocol === "https:" ? https : http;
  const proxyRequest = transport.request(
    {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
      method: request.method,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      headers: {
        ...request.headers,
        host: targetUrl.host,
      },
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    },
  );

  proxyRequest.on("error", (error) => {
    response.writeHead(502, {
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(
      JSON.stringify({
        error: {
          code: "API_PROXY_ERROR",
          message: `前端代理请求后端 API 失败：${error.message}`,
        },
      }),
    );
  });

  request.pipe(proxyRequest);
}

const server = http.createServer((request, response) => {
  if ((request.url || "").startsWith("/api/")) {
    proxyApiRequest(request, response);
    return;
  }

  const requestedPath = request.url === "/" ? "/index.html" : request.url || "/index.html";
  const sanitizedPath = requestedPath.split("?")[0];
  const targetPath = path.join(rootDir, sanitizedPath);

  fs.stat(targetPath, (targetError, targetStats) => {
    if (!targetError && targetStats.isFile()) {
      sendFile(response, targetPath);
      return;
    }

    const fallbackPath = path.join(rootDir, "index.html");
    fs.stat(fallbackPath, (fallbackError) => {
      if (fallbackError) {
        response.writeHead(500, {
          "Content-Type": "text/plain; charset=utf-8",
        });
        response.end("Frontend build output is missing.");
        return;
      }

      sendFile(response, fallbackPath);
    });
  });
});

server.listen(port, () => {
  console.log(`Static frontend server is listening on port ${port}.`);
});
