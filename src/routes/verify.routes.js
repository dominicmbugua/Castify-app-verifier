import { Router } from 'express';
import { parse } from 'csv-parse/sync';
import { verifyOne, verifyBatch } from '../services/verifier.service.js';
import { toCsv } from '../services/report.service.js';

export const router = Router();
let lastResults = [];

// POST /api/verify  { url, expectedName?, expectedDeveloper? }
router.post('/verify', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });
  const result = await verifyOne(req.body);
  lastResults = [result];
  res.json(result);
});

// POST /api/verify/batch  { csv: "url,expected_name,expected_developer\n..." }
router.post('/verify/batch', async (req, res) => {
  const { csv } = req.body || {};
  if (!csv) return res.status(400).json({ error: 'csv text is required' });
  let rows;
  try {
    rows = parse(csv, { columns: (h) => h.map((x) => x.trim().toLowerCase()), skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ error: `Invalid CSV: ${e.message}` });
  }
  const items = rows
    .filter((r) => r.url)
    .map((r) => ({ url: r.url, expectedName: r.expected_name, expectedDeveloper: r.expected_developer }));
  lastResults = await verifyBatch(items);
  res.json(lastResults);
});

// GET /api/export -> CSV of the latest results
router.get('/export', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="verification-results.csv"');
  res.send(toCsv(lastResults));
});
