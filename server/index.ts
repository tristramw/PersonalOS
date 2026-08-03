import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import { buildRoutes } from "./routes";
import { buildAiRoutes } from "./claude";
import { HttpError } from "./http";

const PORT = Number(process.env.PORT ?? 3001);
const app = express();

app.use(express.json({ limit: "1mb" }));

app.use("/api", buildRoutes());
app.use("/api", buildAiRoutes());

// In production the built UI is served from here too, so the whole app is one
// process on one port. In dev, Vite serves the UI and proxies /api over.
if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(process.cwd(), "dist/web");
  app.use(express.static(dist));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.sendFile(path.join(dist, "index.html"));
    } else {
      next();
    }
  });
}

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "Request body is not valid JSON" });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: err instanceof Error ? err.message : "Something went wrong",
  });
});

app.listen(PORT, () => {
  console.log(`PersonalOS API listening on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("No ANTHROPIC_API_KEY set — the three AI features will return 503.");
  }
});
