import { Router } from 'express';
import { buildUnifiedReport } from '../services/unified.js';
import { query } from '../db.js';
import {
  requireId,
  requireDateRange,
  requireEnum,
  optionalText,
  requirePlainObject,
  requireMetaObjectId,
} from '../validate.js';

export const reportsRouter = Router();

const PLATFORMS = ['META', 'GOOGLE', 'MANUAL'];
const REPORT_TYPES = ['unified', 'individual', 'manual'];

reportsRouter.post('/reports/unified', async (req, res, next) => {
  try { res.json(await buildUnifiedReport(req.body || {})); }
  catch (error) { next(error); }
});

reportsRouter.post('/reports/mark-reported', async (req, res, next) => {
  try {
    const body = req.body || {};
    const clientId = requireId(body.clientId, 'clientId');
    const platform = requireEnum(body.platform || 'META', PLATFORMS, 'platform');
    const reportType = requireEnum(body.reportType, REPORT_TYPES, 'reportType');
    const campaignId = body.campaignId ? requireMetaObjectId(body.campaignId, 'campaignId') : null;
    const campaignName = optionalText(body.campaignName, 'campaignName', 500);
    const metadata = requirePlainObject(body.metadata, 'metadata');

    const { startDate, endDate } = requireDateRange(body.startDate, body.endDate);

    const result = await query(`
      INSERT INTO report_logs
        (user_id, client_id, platform, external_campaign_id, campaign_name, report_type, start_date, end_date, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
      RETURNING id, reported_at
    `, [req.user.uid, clientId, platform, campaignId, campaignName, reportType, startDate, endDate, metadata]);

    res.status(201).json({ ok: true, reportLog: result.rows[0] });
  } catch (error) { next(error); }
});

reportsRouter.get('/reports/status', async (req, res, next) => {
  try {
    const clientId = requireId(req.query.clientId, 'clientId');
    const { startDate, endDate } = requireDateRange(req.query.startDate, req.query.endDate);

    const result = await query(`
      SELECT external_campaign_id AS "campaignId", MAX(reported_at) AS "reportedAt"
      FROM report_logs
      WHERE client_id=$1 AND start_date=$2 AND end_date=$3 AND status='REPORTED'
      GROUP BY external_campaign_id
    `, [clientId, startDate, endDate]);

    res.json({ items: result.rows });
  } catch (error) { next(error); }
});
