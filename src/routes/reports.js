import { Router } from 'express';
import { buildUnifiedReport } from '../services/unified.js';
import { query } from '../db.js';

export const reportsRouter = Router();

reportsRouter.post('/reports/unified', async (req, res, next) => {
  try { res.json(await buildUnifiedReport(req.body || {})); }
  catch (error) { next(error); }
});

reportsRouter.post('/reports/mark-reported', async (req, res, next) => {
  try {
    const { clientId, platform = 'META', campaignId, campaignName = '', reportType, startDate, endDate, metadata = {} } = req.body || {};
    if (!clientId || !reportType) return res.status(400).json({ error: 'invalid_input' });
    const result = await query(`
      INSERT INTO report_logs
        (client_id, platform, external_campaign_id, campaign_name, report_type, start_date, end_date, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      RETURNING id, reported_at
    `, [clientId, platform, campaignId || null, campaignName, reportType, startDate || null, endDate || null, JSON.stringify(metadata)]);
    res.status(201).json({ ok: true, reportLog: result.rows[0] });
  } catch (error) { next(error); }
});

reportsRouter.get('/reports/status', async (req, res, next) => {
  try {
    const { clientId, startDate, endDate } = req.query;
    const result = await query(`
      SELECT external_campaign_id AS "campaignId", MAX(reported_at) AS "reportedAt"
      FROM report_logs
      WHERE client_id=$1 AND start_date=$2 AND end_date=$3 AND status='REPORTED'
      GROUP BY external_campaign_id
    `, [clientId, startDate, endDate]);
    res.json({ items: result.rows });
  } catch (error) { next(error); }
});
