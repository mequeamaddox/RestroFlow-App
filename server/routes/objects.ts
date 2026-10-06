import type { Express } from 'express';
import { isAuthenticated } from './helpers';
import { ObjectStorageService, ObjectNotFoundError } from '../objectStorage';
import { assertLocationAccess } from '../securityMiddleware';
import { getObjectLocationIds, getEmployeeFileOwners } from '../objectAccess';
import { assertEmployeeRecordAccess } from '../employeeIdentity';
import { requireObjectAccess } from '../objectAccessMiddleware';

export function registerObjectRoutes(app: Express): void {
  app.post('/api/objects/upload', isAuthenticated, async (_req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error('Error getting upload URL:', error);
      res.status(500).json({ error: 'Failed to get upload URL' });
    }
  });

  app.get('/objects/:objectPath(*)', isAuthenticated, requireObjectAccess({
    getLocationIds: getObjectLocationIds,
    assertAccess: assertLocationAccess,
  }), async (req, res) => {
    try {
      // Personal paperwork: only the employee or a manager, not every coworker at the restaurant.
      for (const owner of await getEmployeeFileOwners(req.path)) {
        if (!await assertEmployeeRecordAccess(req, res, owner)) return;
      }
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error('Error serving object:', error);
      if (error instanceof ObjectNotFoundError) return res.sendStatus(404);
      return res.sendStatus(500);
    }
  });
}
