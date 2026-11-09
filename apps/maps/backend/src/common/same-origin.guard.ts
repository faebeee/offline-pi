import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { isAllowedOrigin } from "../common/cors.middleware.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CORS alone does not stop a cross-origin POST from *reaching* us — the browser
 * sends simple requests and only hides the response. Since these routes delete
 * files and start huge downloads, reject anything that announces itself as
 * coming from another site.
 */
@Injectable()
export class SameOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const site = req.headers["sec-fetch-site"];
    if (typeof site === "string" && site !== "same-origin" && site !== "none") {
      throw new ForbiddenException("cross-site requests are not allowed");
    }

    const origin = req.headers.origin;
    if (origin && !isAllowedOrigin(req, origin)) {
      throw new ForbiddenException(`origin ${origin} is not allowed`);
    }

    return true;
  }
}
