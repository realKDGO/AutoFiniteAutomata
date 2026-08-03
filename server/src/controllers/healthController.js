export function getHealth(req, res) { res.status(200).json({ status: 'ok', service: 'autofa-api', timestamp: new Date().toISOString() }); }
