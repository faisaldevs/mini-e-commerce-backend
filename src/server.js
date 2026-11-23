import http from "node:http";
import { handleResponse } from "./app.js";
import { env } from "./config/env.js";

const app = http.createServer(handleResponse);

app.listen(env.PORT, () => {
  console.log(`${env.NODE_ENV} Server is running on PORT : ${env.PORT}`);
});
