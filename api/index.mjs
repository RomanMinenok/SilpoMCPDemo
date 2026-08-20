import { handleRequest } from "../src/server.mjs";

export default async function handler(request, response) {
  return handleRequest(request, response);
}
