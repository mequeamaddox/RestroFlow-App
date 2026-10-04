import type { RequestHandler, Response } from 'express';

type Dependencies = {
  getLocationIds: (path: string) => Promise<(string | null)[]>;
  assertAccess: (req: any, res: Response, locationId: string) => Promise<boolean>;
};

export function requireObjectAccess({ getLocationIds, assertAccess }: Dependencies): RequestHandler {
  return async (req, res, next) => {
    try {
      // Reject traversal and encoded aliases before querying or reading storage.
      const key = req.path.slice('/objects/'.length);
      if (!req.path.startsWith('/objects/') || !key || /[%\\\x00]/.test(key)
        || key.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
        res.sendStatus(404);
        return;
      }
      const locations = await getLocationIds(req.path);
      if (!locations.length || locations.some(location => !location)) {
        res.sendStatus(404);
        return;
      }
      // If a path has been attached to multiple locations, require access to all
      // of them: adding a second reference must not unlock someone else's file.
      for (const locationId of locations) {
        if (!await assertAccess(req, res, locationId!)) return;
      }
      next();
    } catch (error) {
      console.error('Object access check failed:', error);
      res.sendStatus(500);
    }
  };
}
