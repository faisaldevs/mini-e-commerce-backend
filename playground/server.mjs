import http from "http";

const server = http.createServer();

server.on("request", (req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      data: "Hello World!",
    }),
  );
});

server.listen(3000);
