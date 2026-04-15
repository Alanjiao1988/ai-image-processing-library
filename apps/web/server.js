const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const rootDir = path.join(__dirname, "dist");
const port = Number(process.env.PORT || 8080);

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

const server = http.createServer((request, response) => {
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
