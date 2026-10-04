import { Router } from 'express';
import multer from 'multer';
import * as c from '../controllers/interviewController.js';
import * as ctx from '../controllers/contextController.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const router = Router();

router.get('/health', wrap(c.health));
router.get('/capabilities', c.capabilities);
router.post('/context', upload.single('resume'), wrap(ctx.build));
router.post('/interview/start', wrap(c.start));
router.get('/interview/:id', wrap(c.get));
router.get('/interview/:id/report', wrap(c.report));
router.post('/interview/:id/answer', wrap(c.answer));
router.post('/interview/:id/skip', wrap(c.skip));

export default router;
